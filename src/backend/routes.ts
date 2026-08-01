import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { createHash } from "crypto";
import { authRoutes, requireAdmin, requireAuth } from "./auth";
import { db } from "./data/db";
import { isValidWelcomeSlug } from "./welcome-message-utils";
import {
  canonicalCareerMutationRejected,
  isForeignKeyViolation,
  projectPresentationUpdateSchema,
} from "./career-authority";
import { publicGeoIpHint } from "./geoip";
import { loadLegalDoc } from "./markdown";
import { getGithubActivity, getGithubTimeline } from "./github";
import { getLinkedinActivity, getLinkedinTimeline } from "./linkedin";
import {
  allSkills,
  bio,
  bioParagraphs,
  insertAllSkillSchema,
  insertPortfolioSkillSchema,
  insertSkillsGroupSchema,
  portfolioSkills,
  projects,
  skillsGroup,
  updateAllSkillSchema,
  updatePortfolioSkillSchema,
  updateSkillsGroupSchema,
  auditLogs,
  xyzBullets,
  personalInformation,
  experiences,
  aiModels,
  welcomeMessages,
  insertWelcomeMessageSchema,
  updateWelcomeMessageSchema,
} from "@shared/schema";
import { adminPolicyAcceptance } from "@shared/schema_policy";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Agent, GradientProvider, FireworksProvider, FallbackProvider } from "./agent";
import type { LLMProvider } from "./agent";
import { ensureRenderableMermaid } from "./agent/mermaid";
import { evaluateResponse, randomEvaluatorStatus, randomDiagramStatus } from "./agent/evaluator";
import {
  GitHubRepoTool,
  GitHubFileTreeTool,
  GitHubReadFileTool,
  GitHubCommitsTool,
  GitHubIssuestool,
  ProjectContextTool,
} from "./agent/tools";
import { PORTFOLIO_CHAT_RULES } from "./agent/rules";
import {
  buildChatOwnerContext,
  buildPublicPersonalInformationResponse,
} from "./personal-information";

const DEFAULT_PROJECTS_CACHE_TTL_MINUTES = 60;
const PROMPT_SUGGESTIONS_VERSION = "v4";
const MAX_EVALUATION_REWRITE_ATTEMPTS = 2;
const EMPTY_CHAT_RESPONSE_FALLBACK = "I hit an internal quality-check issue before finalizing a response. Please try that again.";
let projectsCache: { data: any[]; timestamp: number } | null = null;
type PromptSuggestion = { label: string; prompt: string };

/* ------------------------------------------------------------------ */
/*  AI provider singleton                                               */
/*                                                                     */
/*  Built once on first use. Uses Gradient as primary and Fireworks    */
/*  as fallback with per-model 1-hour cooldown on rate limits.         */
/*  Model map is loaded from the ai_models table (fireworks_model_id). */
/* ------------------------------------------------------------------ */

let _aiProvider: LLMProvider | undefined;

async function getAiProvider(): Promise<LLMProvider | undefined> {
  if (_aiProvider) return _aiProvider;

  const gradientToken = process.env.GRADIENT_AI_TOKEN;
  if (!gradientToken) return undefined;

  const gradient = new GradientProvider({ token: gradientToken });
  const fireworksToken = process.env.FIREWORKS_AI_TOKEN;

  if (!fireworksToken) {
    _aiProvider = gradient;
    return _aiProvider;
  }

  // Build the gradient-to-fireworks model ID map from the DB
  const rows = await db
    .select({ modelId: aiModels.modelId, fireworksModelId: aiModels.fireworksModelId })
    .from(aiModels)
    .where(eq(aiModels.enabled, true));

  const modelMap: Record<string, string> = {};
  for (const row of rows) {
    if (row.fireworksModelId) {
      modelMap[row.modelId] = row.fireworksModelId;
    }
  }

  _aiProvider = new FallbackProvider({
    primary: gradient,
    fallback: new FireworksProvider({ apiKey: fireworksToken }),
    modelMap,
  });

  return _aiProvider;
}
const promptSuggestionsCache = new Map<string, PromptSuggestion[]>();
// Deduplicates concurrent requests for the same cache key to a single LLM call
const promptSuggestionsInflight = new Map<string, Promise<PromptSuggestion[]>>();

function writeSseAssistantMessage(res: Response, content: string) {
  if (res.writableEnded) return;
  const chunk = JSON.stringify({ choices: [{ delta: { content } }] });
  res.write(`data: ${chunk}\n\n`);
  res.write("data: [DONE]\n\n");
}

function writeSseAssistantMessages(res: Response, messages: string[]) {
  if (res.writableEnded) return;
  for (const content of messages) {
    const payload = JSON.stringify({ content });
    res.write(`event: assistant_message\ndata: ${payload}\n\n`);
  }
  res.write("data: [DONE]\n\n");
}

function writeSseEvaluatorStatus(res: Response, status: string) {
  if (res.writableEnded) return;
  res.write(`event: evaluator\ndata: ${JSON.stringify({ status })}\n\n`);
}

function writeSseAgentPhase(res: Response, phase: "thinking" | "refining" | "diagramming") {
  if (res.writableEnded) return;
  res.write(`event: agent_phase\ndata: ${JSON.stringify({ phase })}\n\n`);
}

async function finalizeAssistantResponseSafely(
  content: string,
  options: {
    modelId: string;
    provider: LLMProvider;
  },
) {
  const original = content.trim();
  if (!original) {
    return { content: "" };
  }

  try {
    const finalized = await ensureRenderableMermaid(original, {
      modelId: options.modelId,
      provider: options.provider,
    });

    return { content: finalized.content.trim() || original };
  } catch {
    return { content: original };
  }
}

function getProjectsCacheTtlMs() {
  const parsed = Number.parseInt(process.env.PROJECTS_CACHE_TTL_MINUTES || "", 10);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROJECTS_CACHE_TTL_MINUTES;
  return minutes * 60_000;
}

function invalidateProjectsCache() {
  projectsCache = null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/auth/login", authRoutes.start);
  app.get("/auth/callback", authRoutes.callback);

  // ========== AUTH ==========
  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({
      id: req.user?.id,
      subject: req.auth0Identity?.subject ?? req.user?.auth0Sub,
      name: req.user?.name,
      role: req.user?.role,
      auth_method: "auth0",
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    return authRoutes.logout(req, res);
  });
  app.post("/auth/logout", (req, res) => {
    return authRoutes.logout(req, res);
  });

  // ========== LEGAL DOCUMENTS ==========
  // The API serves the checked-in legal text used by the matching SPA routes.
  const sendLegalDoc = (filename: string, notFoundMsg: string) => (_req: Request, res: Response) => {
    const doc = loadLegalDoc(filename);
    if (!doc) return res.status(404).json({ message: notFoundMsg });
    res.json(doc);
  };

  app.get("/api/legal/privacy", sendLegalDoc("PRIVACY_POLICY.md", "Privacy Policy not found"));
  app.get("/api/legal/terms", sendLegalDoc("TERMS_OF_USE.md", "Terms of Use not found"));
  app.get("/api/legal/tracking", sendLegalDoc("TRACKING_NOTICE_AND_CONSENT.md", "Tracking Notice not found"));

  // ========== GEOLOCATION ==========
  app.get("/api/public/geoip", (_req, res) => {
    res.json(publicGeoIpHint());
  });

  // ========== POLICY ACCEPTANCE ==========
  app.get("/api/admin/policy/check-acceptance", requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const POLICY_VERSION = "1.0";
    const TERMS_VERSION = "1.0";
    const PRIVACY_VERSION = "1.0";

    const [acceptance] = await db
      .select()
      .from(adminPolicyAcceptance)
      .where(
        sql`${adminPolicyAcceptance.adminId} = ${userId}
        AND ${adminPolicyAcceptance.policyVersion} = ${POLICY_VERSION}
        AND ${adminPolicyAcceptance.termsVersion} = ${TERMS_VERSION}
        AND ${adminPolicyAcceptance.privacyVersion} = ${PRIVACY_VERSION}
        AND ${adminPolicyAcceptance.accepted} = true`
      )
      .limit(1);

    if (acceptance) {
      return res.json({ accepted: true, acceptance });
    }

    res.status(403).json({ accepted: false });
  });

  app.post("/api/admin/policy/accept", requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const POLICY_VERSION = "1.0";
    const TERMS_VERSION = "1.0";
    const PRIVACY_VERSION = "1.0";

    const [result] = await db
      .insert(adminPolicyAcceptance)
      .values({
        adminId: userId,
        policyVersion: POLICY_VERSION,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        accepted: true,
      })
      .onConflictDoUpdate({
        target: [
          adminPolicyAcceptance.adminId,
          adminPolicyAcceptance.policyVersion,
          adminPolicyAcceptance.termsVersion,
          adminPolicyAcceptance.privacyVersion,
        ],
        set: { accepted: true, timestamp: new Date() },
      })
      .returning();

    await logAudit(req, "policy.admin_accepted", {
      admin_id: userId,
      policy_version: POLICY_VERSION,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    });

    res.json({ ok: true, result });
  });

  // ========== PUBLIC DATA ==========
  
  app.get("/api/skills-constellation", async (_req, res) => {
    try {
      const skills = await db
        .select({
          portfolio_skill_id: portfolioSkills.id,
          skill_id: allSkills.id,
          skill_name: allSkills.name,
          group_id: skillsGroup.id,
          group_name: skillsGroup.name,
          group_position: skillsGroup.position,
          skill_position: portfolioSkills.position,
        })
        .from(portfolioSkills)
        .innerJoin(allSkills, eq(portfolioSkills.allSkillId, allSkills.id))
        .leftJoin(skillsGroup, eq(portfolioSkills.groupId, skillsGroup.id))
        .where(sql`${portfolioSkills.deletedAt} IS NULL`)
        .orderBy(asc(skillsGroup.position), asc(portfolioSkills.position), asc(allSkills.name));

      res.json(skills);
    } catch {
      console.error(JSON.stringify({
        event: "portfolio.skills_constellation_failed",
        failure_code: "skills_unavailable",
      }));
      res.status(500).json({ error: "Failed to fetch skills constellation" });
    }
  });

  app.get("/api/public/github/activity", async (_req, res) => {
    try {
      const data = await getGithubActivity();
      res.json(data);
    } catch {
      console.error(JSON.stringify({ event: "portfolio.github.activity_failed" }));
      res.status(500).json({ error: "Failed to fetch GitHub activity" });
    }
  });

  app.get("/api/public/github/timeline", async (req, res) => {
    try {
      const page = Math.max(1, Math.min(10, parseInt(req.query.page as string) || 1));
      const data = await getGithubTimeline(page);
      res.json(data);
    } catch {
      console.error(JSON.stringify({ event: "portfolio.github.timeline_failed" }));
      res.status(500).json({ error: "Failed to fetch GitHub timeline" });
    }
  });

  app.get("/api/public/linkedin/activity", async (_req, res) => {
    try {
      const data = await getLinkedinActivity();
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("403")) {
        return res.status(403).json({ error: "LinkedIn features in maintenence" });
      }
      console.error(JSON.stringify({ event: "portfolio.linkedin.activity_failed" }));
      res.status(500).json({ error: "Failed to fetch LinkedIn activity" });
    }
  });

  app.get("/api/public/linkedin/timeline", async (req, res) => {
    try {
      const page = Math.max(1, Math.min(10, parseInt(req.query.page as string) || 1));
      const data = await getLinkedinTimeline(page);
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("403")) {
        return res.status(403).json({ error: "LinkedIn features in maintenence" });
      }
      console.error(JSON.stringify({ event: "portfolio.linkedin.timeline_failed" }));
      res.status(500).json({ error: "Failed to fetch LinkedIn timeline" });
    }
  });

  app.get("/api/public/projects", async (_req, res) => {
    const ttlMs = getProjectsCacheTtlMs();
    if (projectsCache && Date.now() - projectsCache.timestamp <= ttlMs) {
      return res.json(projectsCache.data);
    }

    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NULL`)
      .orderBy(asc(projects.position));
    const data = await hydrateProjectsWithBullets(rows);

    projectsCache = { data, timestamp: Date.now() };
    res.json(data);
  });

  app.get("/api/public/projects/:id", async (req, res) => {
    const projectId = routeId(req.params.id);
    if (!projectId) {
      return res.status(400).json({ error: "Project id is required" });
    }

    const ttlMs = getProjectsCacheTtlMs();
    if (projectsCache && Date.now() - projectsCache.timestamp <= ttlMs) {
      const cachedProject = projectsCache.data.find((project) => project.id === projectId);
      if (cachedProject) {
        return res.json(cachedProject);
      }
    }

    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), sql`${projects.deletedAt} IS NULL`))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [hydratedProject] = await hydrateProjectsWithBullets([project]);
    res.json(hydratedProject);
  });

  // ========== AI CHAT ==========

  app.get("/api/public/ai-models", async (_req, res) => {
    const rows = await db.select({
      id: aiModels.id,
      label: aiModels.label,
      modelId: aiModels.modelId,
      provider: aiModels.provider,
    }).from(aiModels)
      .where(eq(aiModels.enabled, true))
      .orderBy(asc(aiModels.position));
    res.json(rows);
  });

  app.get("/api/public/chat-prompt-suggestions", async (req, res) => {
    const provider = await getAiProvider();
    if (!provider) {
      return res.status(503).json({ error: "AI chat is not configured" });
    }

    const projectId = String(req.query.projectId || "");
    const modelId = String(req.query.modelId || "");
    if (!projectId || !modelId) {
      return res.status(400).json({ error: "projectId and modelId are required" });
    }

    const [model] = await db.select().from(aiModels)
      .where(eq(aiModels.modelId, modelId))
      .limit(1);
    if (!model || !model.enabled) {
      return res.status(400).json({ error: "Model not available" });
    }

    const [project] = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const tools = [
      new ProjectContextTool(),
      ...(project.githubUrl ? [
        new GitHubRepoTool(),
        new GitHubFileTreeTool(),
        new GitHubReadFileTool(),
        new GitHubCommitsTool(),
        new GitHubIssuestool(),
      ] : []),
    ];

    const promptInputsHash = createPromptSuggestionsHash(project, tools.map((tool) => tool.definition));
    const cacheKey = `${modelId}:${promptInputsHash}`;

    // Fast path: already computed
    const cached = promptSuggestionsCache.get(cacheKey);
    if (cached) {
      return res.json({ hash: promptInputsHash, suggestions: cached });
    }

    // Coalesce: join an in-flight computation rather than spawning a duplicate
    const existing = promptSuggestionsInflight.get(cacheKey);
    if (existing) {
      try {
        const suggestions = await existing;
        return res.json({ hash: promptInputsHash, suggestions });
      } catch {
        // Inflight failed for another requester; fall through and return fallback
        return res.json({
          hash: promptInputsHash,
          suggestions: fallbackPromptSuggestions(project.title),
          fallback: true,
        });
      }
    }

    const suggestionsAgent = new Agent({
      name: "prompt-suggestions",
      modelId,
      provider,
      systemPrompt: [
        "You write suggested starter prompts for a portfolio project chat.",
        "The prompts must help a visitor either understand the project better or connect more directly to its creator.",
        "Return valid JSON only in the form {\"suggestions\":[{\"label\":\"...\",\"prompt\":\"...\"}]}.",
        "Rules:",
        "- Provide exactly 5 suggestions.",
        "- Each label must be at least 2 words and at most 3 words.",
        "- Each label must be 18 characters or fewer.",
        "- Prefer short, compact phrasing that still feels specific.",
        "- Each prompt must be one clear user message between 40 and 120 characters.",
        "- The prompt should sound natural if sent directly into chat.",
        "- Vary the angle across architecture, implementation, current progress, code-level details, and creator context.",
        "- Do not mention tools by internal function names.",
        "- Do not use numbering, bullets, markdown, or extra keys.",
      ].join("\n"),
      maxTokens: 400,
      temperature: 0.7,
    });

    // Register the promise before awaiting so concurrent requests share it
    const computePromise = suggestionsAgent.run([{
      role: "user",
      content: JSON.stringify({
        project: {
          title: project.title,
          category: project.category,
          description: project.description,
          longDescription: project.longDescription,
          tech: project.tech,
          githubUrl: project.githubUrl,
          deployedUrl: project.deployedUrl,
        },
        toolsAvailable: tools.map((tool) => ({
          name: tool.definition.name,
          description: tool.definition.description,
        })),
      }),
    }]).then((raw) => normalizePromptSuggestions(raw, project.title));

    promptSuggestionsInflight.set(cacheKey, computePromise);

    try {
      const suggestions = await computePromise;
      promptSuggestionsCache.set(cacheKey, suggestions);
      res.json({ hash: promptInputsHash, suggestions });
    } catch (error) {
      const fallback = fallbackPromptSuggestions(project.title);
      const rateLimited = suggestionsAgent.isRateLimitError(error);
      if (!rateLimited) {
        promptSuggestionsCache.set(cacheKey, fallback);
      }
      res.json({
        hash: promptInputsHash,
        suggestions: fallback,
        fallback: true,
        error: rateLimited ? suggestionsAgent.rateLimitMessage : "Suggestions unavailable",
      });
    } finally {
      promptSuggestionsInflight.delete(cacheKey);
    }
  });

  app.post("/api/public/chat", async (req, res) => {
    const provider = await getAiProvider();
    if (!provider) {
      return res.status(503).json({ error: "AI chat is not configured" });
    }

    const { projectId, modelId, messages, welcome } = req.body;
    if (!projectId || !modelId || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "projectId, modelId, and messages[] are required" });
    }

    // Validate model is allowed
    const [model] = await db.select().from(aiModels)
      .where(eq(aiModels.modelId, modelId))
      .limit(1);
    if (!model || !model.enabled) {
      return res.status(400).json({ error: "Model not available" });
    }

    // Get project + system prompt
    const [project] = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const rules = PORTFOLIO_CHAT_RULES.toPromptBlock();

    const [personalInfo] = await db.select().from(personalInformation)
      .orderBy(desc(personalInformation.updatedAt))
      .limit(1);

    const owner = buildChatOwnerContext(personalInfo);
    const generalInformation = owner
      ? `\n\nGeneral information: The project/portfolio owner is ${owner.name}. Contact: ${owner.email} | ${owner.phone} | ${owner.linkedinUrl}`
      : "\n\nOwner information is not configured. Do not invent or infer the creator's identity, contact details, or links.";

    const basePrompt = project.aiSystemPrompt
      || `You are an AI assistant for the project "${project.title}". Full project details have been loaded into this conversation as tool results — refer to them. Use the GitHub tools to fetch repository details and dig deeper whenever a question requires verified source-level information. Be professional yet conversational.`;

    const systemPrompt = basePrompt + generalInformation + rules;

    const tools = [
      new ProjectContextTool(),
      ...(project.githubUrl ? [
        new GitHubRepoTool(),
        new GitHubFileTreeTool(),
        new GitHubReadFileTool(),
        new GitHubCommitsTool(),
        new GitHubIssuestool(),
      ] : []),
    ];

    const agent = new Agent({
      name: "orchestrator",
      modelId,
      provider,
      systemPrompt,
      tools,
      maxTokens: 4096,
      maxToolRounds: 12,
    });

    const welcomeOwnerInstruction = owner
      ? ` Then naturally introduce its creator, ${owner.name}, and invite the visitor to reach out: email ${owner.email}, phone ${owner.phone}, LinkedIn ${owner.linkedinUrl}.`
      : " Do not invent or infer the creator's identity or contact details because owner information is not configured.";

    const userMessages: Array<{ role: "user" | "assistant"; content: string }> = welcome
      ? [{
        role: "user",
        content: `[WELCOME] Greet this visitor with a single short paragraph — no lists, no headers. First, give a crisp ~20-word description of this project as you would pitch it to a non-technical hiring manager: what it does and why it matters.${welcomeOwnerInstruction}`,
      }]
      : messages.slice(-20).map((m: any) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: String(m.content).slice(0, 4000),
      }));

    let seed: any[] = [];
    if (!welcome) {
      const isFirstTurn = !userMessages.some((m) => m.role === "assistant");
      const primeCalls: Array<{ name: string; args: Record<string, unknown> }> = [
        { name: "get_project_details", args: { project_id: project.id } },
      ];
      if (isFirstTurn && project.githubUrl) {
        const ghMatch = project.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (ghMatch) {
          primeCalls.push({ name: "github_repo_overview", args: { owner: ghMatch[1], repo: ghMatch[2] } });
        }
      }
      seed = await agent.primeContext(primeCalls) as any;
    }

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (welcome) {
        const welcomeSummaryMessages: Array<{ role: "user"; content: string }> = [{
          role: "user",
          content: `Project Details: ${JSON.stringify(project)}\n\n[WELCOME_SUMMARY] Write exactly one short paragraph with no lists or headers. Summarize this project for a non-technical hiring manager: what it does and why it matters.`,
        }];
        const aiSummary = (await agent.run([...seed, ...welcomeSummaryMessages] as any)).trim() || project.description;
        const welcomeMessages = buildWelcomeMessages({ aiSummary, owner });
        writeSseAssistantMessages(res, welcomeMessages);

        res.end();
        return;
      }

      let bufferedAssistantText = "";
      writeSseAgentPhase(res, "thinking");
      for await (const event of agent.stream([...seed, ...userMessages] as any)) {
        if (event.type === "tool_call") {
          res.write(`event: tool_call\ndata: ${JSON.stringify({ name: event.name, args: event.args })}\n\n`);
        } else {
          bufferedAssistantText += event.delta;
        }
      }

      if (bufferedAssistantText.includes("```mermaid")) {
        writeSseAgentPhase(res, "diagramming");
        writeSseEvaluatorStatus(res, randomDiagramStatus());
      }

      const finalizedAssistantText = await finalizeAssistantResponseSafely(bufferedAssistantText, {
        modelId,
        provider,
      });

      let responseContent = finalizedAssistantText.content;

      // Safety net: if streaming produced no assistant text, force one non-streaming regeneration attempt.
      if (!responseContent) {
        try {
          const regenerated = (await agent.run([...seed, ...userMessages] as any)).trim();
          if (regenerated) {
            if (regenerated.includes("```mermaid")) {
              writeSseAgentPhase(res, "diagramming");
              writeSseEvaluatorStatus(res, randomDiagramStatus());
            }
            const regeneratedFinal = await finalizeAssistantResponseSafely(regenerated, {
              modelId,
              provider,
            });
            responseContent = regeneratedFinal.content;
          }
        } catch {
          // Ignore regeneration failures and fall back to a static message below.
        }
      }

      // Signal that evaluation is running so the client can show the status row
      writeSseAgentPhase(res, "refining");
      const evalStatus = randomEvaluatorStatus();
      writeSseEvaluatorStatus(res, evalStatus);

      // Quality evaluation must never prevent a usable response.
      let evalResult = await evaluateResponse({
        response: responseContent,
        userMessages,
        modelId,
        provider,
      }).catch(() => ({ pass: true, score: 1.0, violations: [] as any[] }));

      let evaluationRewriteAttempts = 0;
      while (responseContent && !evalResult.pass && evaluationRewriteAttempts < MAX_EVALUATION_REWRITE_ATTEMPTS) {
        let revised = "";
        try {
          revised = (await agent.run([
            ...seed,
            ...userMessages,
            { role: "assistant", content: responseContent },
            {
              role: "user",
              content: [
                "[EVALUATOR_REWRITE]",
                "Your previous answer failed quality checks.",
                "Rewrite the full answer so it still answers the user's latest request, while fixing every listed violation.",
                "Return only the revised answer with no preamble.",
                "Violations:",
                JSON.stringify(evalResult.violations),
              ].join("\n"),
            },
          ] as any)).trim();
        } catch {
          // Keep the last known-good response if rewrite generation fails.
          break;
        }

        if (!revised) break;

        if (revised.includes("```mermaid")) {
          writeSseAgentPhase(res, "diagramming");
          writeSseEvaluatorStatus(res, randomDiagramStatus());
        }

        const revisedFinal = await finalizeAssistantResponseSafely(revised, {
          modelId,
          provider,
        });
        const revisedContent = revisedFinal.content;
        if (!revisedContent) break;

        responseContent = revisedContent;
        evaluationRewriteAttempts += 1;

        evalResult = await evaluateResponse({
          response: responseContent,
          userMessages,
          modelId,
          provider,
        }).catch(() => ({ pass: true, score: 1.0, violations: [] as any[] }));
      }

      if (!responseContent) {
        responseContent = EMPTY_CHAT_RESPONSE_FALLBACK;
      }

      writeSseAssistantMessage(res, responseContent);
      res.end();
      return;
    } catch (error) {
      if (agent.isRateLimitError(error)) {
        writeSseAssistantMessage(res, agent.rateLimitMessage);
        res.end();
        return;
      }

      if (!res.headersSent) {
        console.error(JSON.stringify({ event: "portfolio.ai.request_failed" }));
        res.status(500).json({ error: "AI request failed" });
      } else {
        res.end();
      }
    }
  });

  app.get("/api/public/bio", async (_req, res) => {
    const [row] = await db.select().from(bio)
      .orderBy(desc(bio.createdAt))
      .limit(1);
    if (!row) return res.json({ headline: "", paragraphs: [] });
    const paragraphs = await db.select().from(bioParagraphs)
      .where(eq(bioParagraphs.bioId, row.id))
      .orderBy(asc(bioParagraphs.position));
    res.json({ ...row, paragraphs });
  });

  app.get("/api/public/skills", async (_req, res) => {
    const rows = await db.select().from(portfolioSkills)
      .where(sql`${portfolioSkills.deletedAt} IS NULL`)
      .orderBy(asc(portfolioSkills.position));
    const hydrated = await hydratePortfolioSkills(rows);
    res.json(hydrated.map((row) => ({ id: row.id, label: row.label })));
  });

  app.get("/api/public/experiences", async (_req, res) => {
    const rows = await db.select().from(experiences).orderBy(asc(experiences.position));
    res.json(rows);
  });

  app.get("/api/public/personal-information", async (_req, res) => {
    const [row] = await db.select().from(personalInformation)
      .orderBy(desc(personalInformation.updatedAt))
      .limit(1);

    res.json(buildPublicPersonalInformationResponse(row));
  });

  app.get("/api/admin/projects", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NULL`)
      .orderBy(asc(projects.position));
    res.json(await hydrateProjectsWithBullets(rows));
  });

  app.post("/api/admin/projects", requireAdmin, canonicalCareerMutationRejected);

  app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
    const projectId = routeId(req.params.id);
    const parsed = projectPresentationUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [updated] = await db
      .update(projects)
      .set(parsed.data)
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Project not found" });
    }

    invalidateProjectsCache();
    await logAudit(req, "project.presentation.update", { id: projectId, ...parsed.data });
    const [hydrated] = await hydrateProjectsWithBullets([updated]);
    res.json(hydrated);
  });

  app.delete("/api/admin/projects/:id", requireAdmin, canonicalCareerMutationRejected);

  app.post("/api/admin/projects/reorder", requireAdmin, async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id: string, index: number) =>
          tx.update(projects).set({ position: index }).where(eq(projects.id, id))
        )
      );
    });
    invalidateProjectsCache();
    await logAudit(req, "project.reorder", { order });
    res.json({ ok: true });
  });

  app.get("/api/admin/bio", requireAdmin, async (_req, res) => {
    const [row] = await db.select().from(bio)
      .orderBy(desc(bio.createdAt))
      .limit(1);
    if (!row) return res.json({ headline: "", paragraphs: [] });
    const paragraphs = await db.select().from(bioParagraphs)
      .where(eq(bioParagraphs.bioId, row.id))
      .orderBy(asc(bioParagraphs.position));
    res.json({ ...row, paragraphs });
  });

  app.get("/api/admin/personal-information", requireAdmin, async (_req, res) => {
    const [row] = await db.select().from(personalInformation)
      .orderBy(desc(personalInformation.updatedAt))
      .limit(1);
    res.json(buildPublicPersonalInformationResponse(row));
  });

  app.put("/api/admin/personal-information", requireAdmin, canonicalCareerMutationRejected);

  app.post("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected);
  app.put("/api/admin/bio", requireAdmin, canonicalCareerMutationRejected);

  app.get("/api/admin/bio/versions", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(bio)
      .orderBy(desc(bio.createdAt));
    const hydrated = await Promise.all(rows.map(async (row) => {
      const paragraphs = await db.select().from(bioParagraphs)
        .where(eq(bioParagraphs.bioId, row.id))
        .orderBy(asc(bioParagraphs.position));
      return { ...row, paragraphs };
    }));
    res.json(hydrated);
  });

  app.post("/api/admin/bio/:id/restore", requireAdmin, canonicalCareerMutationRejected);
  app.delete("/api/admin/bio/:id", requireAdmin, canonicalCareerMutationRejected);

  app.get("/api/admin/skills", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(portfolioSkills)
      .where(sql`${portfolioSkills.deletedAt} IS NULL`)
      .orderBy(asc(portfolioSkills.position));
    res.json(await hydratePortfolioSkills(rows));
  });

  app.get("/api/admin/skills-groups", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(skillsGroup)
      .orderBy(asc(skillsGroup.position), asc(skillsGroup.name));
    res.json(rows);
  });

  app.post("/api/admin/skills-groups", requireAdmin, async (req, res) => {
    const parsed = insertSkillsGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const [duplicate] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
      .where(sql`lower(trim(${skillsGroup.name})) = lower(trim(${parsed.data.name}))`)
      .limit(1);
    if (duplicate) return res.status(409).json({ message: "A display group with that name already exists" });

    const [maxRow] = await db
      .select({ max: sql<number>`max(${skillsGroup.position})` })
      .from(skillsGroup);
    const [created] = await db
      .insert(skillsGroup)
      .values({ ...parsed.data, position: (maxRow?.max ?? -1) + 1 })
      .returning();
    await logAudit(req, "skillsGroup.create", created);
    res.json(created);
  });

  app.put("/api/admin/skills-groups/:id", requireAdmin, async (req, res) => {
    const groupId = routeId(req.params.id);
    const parsed = updateSkillsGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    if (parsed.data.name) {
      const [duplicate] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
        .where(and(
          sql`lower(trim(${skillsGroup.name})) = lower(trim(${parsed.data.name}))`,
          sql`${skillsGroup.id} <> ${groupId}`,
        ))
        .limit(1);
      if (duplicate) return res.status(409).json({ message: "A display group with that name already exists" });
    }

    const [updated] = await db
      .update(skillsGroup)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(skillsGroup.id, groupId))
      .returning();

    await logAudit(req, "skillsGroup.update", { id: groupId, ...parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/skills-groups/:id", requireAdmin, async (req, res) => {
    const groupId = routeId(req.params.id);
    const [membership] = await db.select({ id: portfolioSkills.id }).from(portfolioSkills)
      .where(and(
        eq(portfolioSkills.groupId, groupId),
        sql`${portfolioSkills.deletedAt} IS NULL`,
      ))
      .limit(1);
    if (membership) {
      return res.status(409).json({ message: "Move or remove this group's visible skills before deleting it" });
    }
    const [deleted] = await db.delete(skillsGroup)
      .where(eq(skillsGroup.id, groupId))
      .returning({ id: skillsGroup.id });
    if (!deleted) return res.status(404).json({ message: "Display group not found" });
    await logAudit(req, "skillsGroup.delete", { id: groupId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills-groups/reorder", requireAdmin, async (req, res) => {
    const order: string[] = Array.isArray(req.body?.order)
      ? req.body.order.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id, index) =>
          tx.update(skillsGroup).set({ position: index }).where(eq(skillsGroup.id, id))
        ),
      );
    });
    await logAudit(req, "skillsGroup.reorder", { order });
    res.json({ ok: true });
  });

  app.get("/api/admin/all-skills", requireAdmin, async (_req, res) => {
    const rows = await db.select({
      id: allSkills.id,
      name: allSkills.name,
      groupingId: allSkills.groupingId,
      groupingName: skillsGroup.name,
    })
      .from(allSkills)
      .leftJoin(skillsGroup, eq(allSkills.groupingId, skillsGroup.id))
      .orderBy(asc(allSkills.name));
    const references = await db
      .select({
        allSkillId: portfolioSkills.allSkillId,
        count: sql<number>`count(*)::int`,
      })
      .from(portfolioSkills)
      .groupBy(portfolioSkills.allSkillId);
    const referencesBySkill = new Map(
      references.map((row) => [row.allSkillId, Number(row.count)]),
    );
    res.json(rows.map((row) => ({
      ...row,
      portfolioReferences: referencesBySkill.get(row.id) ?? 0,
    })));
  });

  app.post("/api/admin/all-skills", requireAdmin, async (req, res) => {
    const parsed = insertAllSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    if (parsed.data.groupingId) {
      const [group] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
        .where(eq(skillsGroup.id, parsed.data.groupingId))
        .limit(1);
      if (!group) return res.status(400).json({ message: "Choose an existing skill group" });
    }
    const [duplicate] = await db.select({ id: allSkills.id }).from(allSkills)
      .where(sql`lower(trim(${allSkills.name})) = lower(trim(${parsed.data.name}))`)
      .limit(1);
    if (duplicate) return res.status(409).json({ message: "A skill with that name already exists" });

    const [created] = await db.insert(allSkills).values(parsed.data).returning();
    await logAudit(req, "allSkill.create", {
      id: created.id,
      name: created.name,
      groupingId: created.groupingId,
    });
    const [hydrated] = await hydrateCanonicalSkills([created]);
    res.status(201).json(hydrated);
  });

  app.put("/api/admin/all-skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const parsed = updateAllSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    if (parsed.data.groupingId) {
      const [group] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
        .where(eq(skillsGroup.id, parsed.data.groupingId))
        .limit(1);
      if (!group) return res.status(400).json({ message: "Choose an existing skill group" });
    }
    if (parsed.data.name) {
      const [duplicate] = await db.select({ id: allSkills.id }).from(allSkills)
        .where(and(
          sql`lower(trim(${allSkills.name})) = lower(trim(${parsed.data.name}))`,
          sql`${allSkills.id} <> ${skillId}`,
        ))
        .limit(1);
      if (duplicate) return res.status(409).json({ message: "A skill with that name already exists" });
    }

    const [updated] = await db
      .update(allSkills)
      .set(parsed.data)
      .where(eq(allSkills.id, skillId))
      .returning();
    if (!updated) return res.status(404).json({ message: "Skill not found" });
    await logAudit(req, "allSkill.update", {
      id: skillId,
      name: updated.name,
      groupingId: updated.groupingId,
    });
    const [hydrated] = await hydrateCanonicalSkills([updated]);
    res.json(hydrated);
  });

  app.delete("/api/admin/all-skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const [portfolioReference] = await db
      .select({ id: portfolioSkills.id })
      .from(portfolioSkills)
      .where(eq(portfolioSkills.allSkillId, skillId))
      .limit(1);
    if (portfolioReference) {
      return res.status(409).json({
        message: "Remove this skill from the Portfolio map before deleting it",
      });
    }

    try {
      const [deleted] = await db
        .delete(allSkills)
        .where(eq(allSkills.id, skillId))
        .returning({ id: allSkills.id });
      if (!deleted) return res.status(404).json({ message: "Skill not found" });
    } catch (error) {
      if (isForeignKeyViolation(
        error,
        "portfolio_skills_all_skill_id_all_skills_id_fk",
      )) {
        return res.status(409).json({
          message: "Remove this skill from the Portfolio map before deleting it",
        });
      }
      if (isForeignKeyViolation(
        error,
        "doc_skill_category_variants_variant_id_all_skills_id_fk",
      )) {
        return res.status(409).json({
          message: "This skill is used by a Resume. Remove those Resume references first.",
        });
      }
      throw error;
    }

    await logAudit(req, "allSkill.delete", { id: skillId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills", requireAdmin, async (req, res) => {
    const parsed = insertPortfolioSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [allSkill] = await db.select().from(allSkills)
      .where(eq(allSkills.id, parsed.data.allSkillId))
      .limit(1);
    if (!allSkill) return res.status(400).json({ message: "Invalid all_skill reference" });

    if (parsed.data.groupId) {
      const [group] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
        .where(eq(skillsGroup.id, parsed.data.groupId))
        .limit(1);
      if (!group) return res.status(400).json({ message: "Invalid skills_group reference" });
    }

    const [existingMembership] = await db.select({ id: portfolioSkills.id }).from(portfolioSkills)
      .where(and(
        eq(portfolioSkills.allSkillId, parsed.data.allSkillId),
        sql`${portfolioSkills.deletedAt} IS NULL`,
      ))
      .limit(1);
    if (existingMembership) {
      return res.status(409).json({ message: "Skill is already visible in Portfolio" });
    }

    const [maxRow] = await db
      .select({ max: sql<number>`max(${portfolioSkills.position})` })
      .from(portfolioSkills)
      .where(parsed.data.groupId
        ? eq(portfolioSkills.groupId, parsed.data.groupId)
        : isNull(portfolioSkills.groupId));
    const nextPos = (maxRow?.max ?? -1) + 1;

    let created;
    try {
      [created] = await db
        .insert(portfolioSkills)
        .values({ ...parsed.data, position: nextPos })
        .returning();
    } catch (error) {
      if (isForeignKeyViolation(error, "portfolio_skills_all_skill_id_all_skills_id_fk")) {
        return res.status(400).json({ message: "Invalid all_skill reference" });
      }
      throw error;
    }

    await logAudit(req, "portfolioSkill.create", created);
    const [hydrated] = await hydratePortfolioSkills([created]);
    res.json(hydrated);
  });

  app.put("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    const parsed = updatePortfolioSkillSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const [existingMembership] = await db.select({
      id: portfolioSkills.id,
      groupId: portfolioSkills.groupId,
    }).from(portfolioSkills)
      .where(eq(portfolioSkills.id, skillId))
      .limit(1);
    if (!existingMembership) {
      return res.status(404).json({ message: "Portfolio skill not found" });
    }

    if (parsed.data.allSkillId) {
      const [allSkill] = await db.select().from(allSkills)
        .where(eq(allSkills.id, parsed.data.allSkillId))
        .limit(1);
      if (!allSkill) return res.status(400).json({ message: "Invalid all_skill reference" });
    }

    if (parsed.data.groupId) {
      const [group] = await db.select({ id: skillsGroup.id }).from(skillsGroup)
        .where(eq(skillsGroup.id, parsed.data.groupId))
        .limit(1);
      if (!group) return res.status(400).json({ message: "Invalid skills_group reference" });
    }

    let updateValues: Partial<typeof portfolioSkills.$inferInsert> = parsed.data;
    if (
      parsed.data.groupId !== undefined
      && parsed.data.groupId !== existingMembership.groupId
    ) {
      const [maxRow] = await db
        .select({ max: sql<number>`max(${portfolioSkills.position})` })
        .from(portfolioSkills)
        .where(eq(portfolioSkills.groupId, parsed.data.groupId));
      updateValues = {
        ...parsed.data,
        position: (maxRow?.max ?? -1) + 1,
      };
    }

    let updated;
    try {
      [updated] = await db
        .update(portfolioSkills)
        .set(updateValues)
        .where(eq(portfolioSkills.id, skillId))
        .returning();
    } catch (error) {
      if (isForeignKeyViolation(error, "portfolio_skills_all_skill_id_all_skills_id_fk")) {
        return res.status(400).json({ message: "Invalid all_skill reference" });
      }
      if (isForeignKeyViolation(error, "portfolio_skills_group_id_skills_group_id_fk")) {
        return res.status(400).json({ message: "Invalid skills_group reference" });
      }
      throw error;
    }

    await logAudit(req, "portfolioSkill.update", { id: skillId, ...updateValues });
    const [hydrated] = await hydratePortfolioSkills([updated]);
    res.json(hydrated);
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const skillId = routeId(req.params.id);
    await db.delete(portfolioSkills)
      .where(eq(portfolioSkills.id, skillId));
    await logAudit(req, "portfolioSkill.delete", { id: skillId });
    res.json({ ok: true });
  });

  app.post("/api/admin/skills/reorder", requireAdmin, async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    await db.transaction(async (tx) => {
      await Promise.all(
        order.map((id: string, index: number) =>
          tx.update(portfolioSkills).set({ position: index }).where(eq(portfolioSkills.id, id))
        )
      );
    });
    await logAudit(req, "portfolioSkill.reorder", { order });
    res.json({ ok: true });
  });

  // Experience endpoints
  app.get("/api/admin/experiences", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(experiences).orderBy(asc(experiences.position));
    res.json(rows);
  });

  app.post("/api/admin/experiences", requireAdmin, canonicalCareerMutationRejected);
  app.put("/api/admin/experiences/:id", requireAdmin, canonicalCareerMutationRejected);
  app.delete("/api/admin/experiences/:id", requireAdmin, canonicalCareerMutationRejected);

  app.post("/api/admin/experiences/reorder", requireAdmin, canonicalCareerMutationRejected);

  // Archived items endpoints
  app.get("/api/admin/archived/projects", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(projects)
      .where(sql`${projects.deletedAt} IS NOT NULL`)
      .orderBy(asc(projects.deletedAt));
    res.json(rows);
  });

  app.post("/api/admin/projects/:id/restore", requireAdmin, canonicalCareerMutationRejected);

  // ========== WELCOME MESSAGES (PERSONALIZATION) ==========

  // Public: look up a welcome message by slug (archived messages are still active)
  app.get("/api/public/welcome-message", async (req, res) => {
    const slug = req.query.welcome;
    if (!isValidWelcomeSlug(slug)) {
      return res.status(400).json({ error: "Invalid or missing welcome slug" });
    }

    const [row] = await db
      .select({ message: welcomeMessages.message })
      .from(welcomeMessages)
      .where(eq(welcomeMessages.slug, slug))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Welcome message not found" });
    res.json({ message: row.message });
  });

  // Admin: list active (non-archived) welcome messages
  app.get("/api/admin/welcome-messages", requireAdmin, async (_req, res) => {
    const rows = await db
      .select()
      .from(welcomeMessages)
      .where(isNull(welcomeMessages.archivedAt))
      .orderBy(desc(welcomeMessages.createdAt));
    res.json(rows);
  });

  // Admin: list archived welcome messages
  app.get("/api/admin/welcome-messages/archived", requireAdmin, async (_req, res) => {
    const rows = await db
      .select()
      .from(welcomeMessages)
      .where(isNotNull(welcomeMessages.archivedAt))
      .orderBy(desc(welcomeMessages.archivedAt));
    res.json(rows);
  });

  // Admin: create welcome message
  app.post("/api/admin/welcome-messages", requireAdmin, async (req, res) => {
    const parsed = insertWelcomeMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    if (!isValidWelcomeSlug(parsed.data.slug)) {
      return res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens), max 63 chars" });
    }
    const [row] = await db
      .insert(welcomeMessages)
      .values(parsed.data)
      .returning();
    await logAudit(req, "welcome_message.create", { id: row.id, slug: row.slug });
    res.status(201).json(row);
  });

  // Admin: update welcome message
  app.put("/api/admin/welcome-messages/:id", requireAdmin, async (req, res) => {
    const id = routeId(req.params.id);
    const parsed = updateWelcomeMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    if (parsed.data.slug !== undefined && !isValidWelcomeSlug(parsed.data.slug)) {
      return res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens), max 63 chars" });
    }
    const [row] = await db
      .update(welcomeMessages)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(welcomeMessages.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Welcome message not found" });
    await logAudit(req, "welcome_message.update", { id, changes: parsed.data });
    res.json(row);
  });

  // Admin: archive welcome message (hides from admin list, stays active for URL lookup)
  app.post("/api/admin/welcome-messages/:id/archive", requireAdmin, async (req, res) => {
    const id = routeId(req.params.id);
    const [row] = await db
      .update(welcomeMessages)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(welcomeMessages.id, id), isNull(welcomeMessages.archivedAt)))
      .returning();
    if (!row) return res.status(404).json({ error: "Welcome message not found or already archived" });
    await logAudit(req, "welcome_message.archive", { id });
    res.json(row);
  });

  // Admin: unarchive welcome message
  app.post("/api/admin/welcome-messages/:id/unarchive", requireAdmin, async (req, res) => {
    const id = routeId(req.params.id);
    const [row] = await db
      .update(welcomeMessages)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(welcomeMessages.id, id), isNotNull(welcomeMessages.archivedAt)))
      .returning();
    if (!row) return res.status(404).json({ error: "Welcome message not found or not archived" });
    await logAudit(req, "welcome_message.unarchive", { id });
    res.json(row);
  });

  // Admin: hard delete welcome message
  app.delete("/api/admin/welcome-messages/:id", requireAdmin, async (req, res) => {
    const id = routeId(req.params.id);
    const [deleted] = await db
      .delete(welcomeMessages)
      .where(eq(welcomeMessages.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Welcome message not found" });
    await logAudit(req, "welcome_message.delete", { id, slug: deleted.slug });
    res.json({ ok: true });
  });

  return httpServer;
}

async function logAudit(req: Request, action: string, payload: unknown) {
  if (!req.user?.id) return;
  await db.insert(auditLogs).values({
    userId: req.user.id,
    action,
    payload,
  });
}

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildWelcomeMessages(args: {
  aiSummary: string;
  owner: ReturnType<typeof buildChatOwnerContext>;
}) {
  const messages = [
    [`**What this is:** ${args.aiSummary}`].join("\n"),
    [
      "**I'm here to help, I can:**",
    "- Explain the technical implementation and architectural decisions behind this project.",
    "- Pull from the actual project source code when needed.",
    "- Check the repository context, commits, and related history.",
    ].join("\n"),
  ];

  if (args.owner) {
    const firstName = args.owner.name.trim().split(/\s+/)[0];
    messages.push(
      `Reach out to ${firstName} via [Email](mailto:${args.owner.email}), [Phone](tel:${args.owner.phone}), [LinkedIn](${args.owner.linkedinUrl}), or [GitHub](${args.owner.githubUrl})!`,
    );
  }

  return messages;
}

function createPromptSuggestionsHash(
  project: typeof projects.$inferSelect,
  toolsAvailable: Array<{ name: string; description: string; parameters: { type: "object"; properties: Record<string, { type: string; description: string; enum?: string[] }>; required?: string[] } }>,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      version: PROMPT_SUGGESTIONS_VERSION,
      toolsAvailable,
      project: {
        id: project.id,
        title: project.title,
        category: project.category,
        description: project.description,
        longDescription: project.longDescription,
        tech: project.tech,
        githubUrl: project.githubUrl,
        deployedUrl: project.deployedUrl,
        aiSystemPrompt: project.aiSystemPrompt,
      },
    }))
    .digest("hex");
}

function normalizePromptSuggestions(raw: string, projectTitle: string): PromptSuggestion[] {
  try {
    const parsed = JSON.parse(raw);
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const normalized = suggestions
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as { label?: unknown; prompt?: unknown };
        const label = typeof candidate.label === "string" ? candidate.label.trim().replace(/\s+/g, " ") : "";
        const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim().replace(/\s+/g, " ") : "";
        return label && prompt ? { label, prompt } : null;
      })
      .filter((item: PromptSuggestion | null): item is PromptSuggestion => Boolean(item))
      .filter((item: PromptSuggestion) => item.label.length <= 18)
      .filter((item: PromptSuggestion) => {
        const wordCount = item.label.split(/\s+/).filter(Boolean).length;
        return wordCount >= 2 && wordCount <= 3;
      })
      .filter((item: PromptSuggestion) => item.prompt.length >= 40 && item.prompt.length <= 120)
      .slice(0, 5);

    if (normalized.length === 5) {
      return normalized;
    }
  } catch {
    // Fall through to fallback handling.
  }

  return fallbackPromptSuggestions(projectTitle);
}

function fallbackPromptSuggestions(projectTitle: string): PromptSuggestion[] {
  return [
    { label: "Project Overview", prompt: `Give me a clear overview of ${projectTitle} and explain why it matters.` },
    { label: "System Design", prompt: `Walk me through the architecture of ${projectTitle} from the highest level down.` },
    { label: "Source Code", prompt: `Use the project code to explain how ${projectTitle} is actually implemented.` },
    { label: "Recent Progress", prompt: `Check the latest progress on ${projectTitle} and summarize what changed recently.` },
    { label: "Creator Background", prompt: "Tell me about the creator of this project and how this work reflects their strengths." },
  ];
}

async function hydrateProjectsWithBullets(projectRows: any[]) {
  if (!Array.isArray(projectRows) || projectRows.length === 0) return [];

  const projectIds = projectRows.map((row) => row.id);
  const bulletRows = await db
    .select()
    .from(xyzBullets)
    .where(inArray(xyzBullets.projectId, projectIds));

  const bulletsByProjectId = new Map<string, string[]>();
  for (const bulletRow of bulletRows) {
    const prev = bulletsByProjectId.get(bulletRow.projectId) ?? [];
    prev.push(bulletRow.bulletText);
    bulletsByProjectId.set(bulletRow.projectId, prev);
  }

  return projectRows.map((projectRow) => ({
    ...projectRow,
    xyzBullets: bulletsByProjectId.get(projectRow.id) ?? [],
  }));
}

async function hydratePortfolioSkills(skillRows: any[]) {
  if (!Array.isArray(skillRows) || skillRows.length === 0) return [];

  const allSkillIds = skillRows
    .map((row) => row.allSkillId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (allSkillIds.length === 0) {
    return skillRows.map((row) => ({ ...row, label: "" }));
  }

  const allSkillRows = await db.select({ id: allSkills.id, name: allSkills.name })
    .from(allSkills)
    .where(inArray(allSkills.id, allSkillIds));
  const groupIds = skillRows
    .map((row) => row.groupId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const groupRows = groupIds.length
    ? await db.select().from(skillsGroup).where(inArray(skillsGroup.id, groupIds))
    : [];

  const allSkillById = new Map(allSkillRows.map((row) => [row.id, row]));
  const groupById = new Map(groupRows.map((row) => [row.id, row]));

  return skillRows.map((row) => {
    const allSkill = row.allSkillId ? allSkillById.get(row.allSkillId) : undefined;
    const group = row.groupId ? groupById.get(row.groupId) : undefined;

    return {
      ...row,
      label: allSkill?.name ?? "",
      allSkillName: allSkill?.name ?? null,
      groupingName: group?.name ?? null,
    };
  });
}

async function hydrateCanonicalSkills(skillRows: any[]) {
  if (!Array.isArray(skillRows) || skillRows.length === 0) return [];
  const groupIds = skillRows
    .map((row) => row.groupingId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const groups = groupIds.length
    ? await db.select({ id: skillsGroup.id, name: skillsGroup.name })
      .from(skillsGroup)
      .where(inArray(skillsGroup.id, groupIds))
    : [];
  const groupById = new Map(groups.map((group) => [group.id, group.name]));
  return skillRows.map((row) => ({
    id: row.id,
    name: row.name,
    groupingId: row.groupingId ?? null,
    groupingName: row.groupingId ? groupById.get(row.groupingId) ?? null : null,
    portfolioReferences: 0,
  }));
}

