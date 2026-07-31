import { Agent } from "./agent";
import type { ChatMessage } from "./agent";
import type { LLMProvider } from "./providers/base";
import { PORTFOLIO_CHAT_RULES } from "./rules";

export interface EvaluationViolation {
  ruleId: string;
  severity: string;
  reason: string;
}

export interface EvaluationResult {
  pass: boolean;
  score: number;
  violations: EvaluationViolation[];
}

export const EVALUATOR_STATUS_NAMES = [
  "ARTICULATING",
  "JUSTIFYING",
  "REASONING",
  "REFLECTING",
  "ANALYZING",
  "VERIFYING",
  "CALIBRATING",
] as const;

export const DIAGRAM_STATUS_NAMES = [
  "MAPPING",
  "ROUTING",
  "RENDERING",
  "STRUCTURING",
  "CONNECTING",
  "GENERATING",
] as const;

export function randomEvaluatorStatus(): string {
  return EVALUATOR_STATUS_NAMES[Math.floor(Math.random() * EVALUATOR_STATUS_NAMES.length)];
}

export function randomDiagramStatus(): string {
  return DIAGRAM_STATUS_NAMES[Math.floor(Math.random() * DIAGRAM_STATUS_NAMES.length)];
}

const EVALUATOR_SYSTEM_PROMPT = [
  "You are a strict response quality judge for an AI portfolio assistant.",
  "",
  "You will receive a JSON payload with three fields:",
  "  - rules: array of { id, category, severity, evaluationCriteria }",
  "  - response: the assistant response to evaluate",
  "  - conversationContext: the last few user/assistant messages for context",
  "",
  "Your task: check the response against every rule's evaluationCriteria.",
  "Be strict — flag any clear violation.",
  "",
  'Return JSON only in this exact format, with no markdown fence or prose:',
  '{"pass":true,"score":1.0,"violations":[]}',
  "",
  "Rules for scoring:",
  "  - start at 1.0",
  "  - subtract 0.25 per critical violation",
  "  - subtract 0.10 per major violation",
  "  - subtract 0.05 per minor violation",
  "  - clamp to [0.0, 1.0]",
  '  - "pass" is true only when there are zero critical or major violations',
  "",
  "Violation reason must be one short sentence.",
].join("\n");

function parseEvaluationResult(raw: string): EvaluationResult {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonSource = fenced?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(jsonSource);
  return {
    pass: Boolean(parsed?.pass ?? true),
    score: typeof parsed?.score === "number" ? parsed.score : 1.0,
    violations: Array.isArray(parsed?.violations) ? parsed.violations : [],
  };
}

/**
 * Run the full ruleset as an LLM judge against a completed assistant response.
 * Designed to be called fire-and-forget — never throws so callers don't need try/catch.
 */
export async function evaluateResponse(options: {
  response: string;
  userMessages: ChatMessage[];
  modelId: string;
  provider: LLMProvider;
}): Promise<EvaluationResult> {
  const evaluatorAgent = new Agent({
    name: "response-evaluator",
    modelId: options.modelId,
    provider: options.provider,
    systemPrompt: EVALUATOR_SYSTEM_PROMPT,
    maxTokens: 1024,
    temperature: 0.1,
  });

  try {
    const raw = await evaluatorAgent.run([{
      role: "user",
      content: JSON.stringify({
        rules: PORTFOLIO_CHAT_RULES.toEvaluationSpec(),
        response: options.response,
        conversationContext: options.userMessages.slice(-4),
      }),
    }]);

    return parseEvaluationResult(raw);
  } catch {
    return { pass: true, score: 1.0, violations: [] };
  }
}
