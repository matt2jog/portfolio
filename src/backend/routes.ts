import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { createHash } from "crypto";
import { db } from "./data/db";
import { isValidWelcomeSlug } from "./welcome-message-utils";
import { publicGeoIpHint } from "./geoip";
import { loadLegalDoc } from "./markdown";
import { getGithubActivity, getGithubTimeline } from "./github";
import { getLinkedinActivity, getLinkedinTimeline } from "./linkedin";
import {
  allSkills,
  bio,
  bioParagraphs,
  portfolioSkills,
  projects,
  skillsGroup,
  xyzBullets,
  personalInformation,
  experiences,
  aiModels,
  welcomeMessages,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/admin", (_req, res) => {
    const target = process.env.DEPLOYMENT_STAGE === "staging"
      ? "https://admin-staging.2jog.dev/"
      : "https://admin.2jog.dev/";
    res.redirect(308, target);
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

  return httpServer;
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
