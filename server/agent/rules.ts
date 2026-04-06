/**
 * Structured rule/guideline system for agent behavior.
 *
 * Each Rule has:
 *   - id              — stable identifier, used by an LLM judge to reference it
 *   - category        — groups related rules (format, conduct, tools, etc.)
 *   - instruction     — what the model reads in the system prompt
 *   - evaluationCriteria — what a judge uses to assess compliance (future use)
 *   - severity        — how hard a violation should be penalized by a judge
 *
 * A Ruleset collects rules, renders them into a system prompt block, and
 * exports a machine-readable form for evaluation pipelines.
 */

export type RuleSeverity = "critical" | "major" | "minor";
export type RuleCategory = "formatting" | "conduct" | "tools" | "information" | string;

export interface Rule {
  id: string;
  category: RuleCategory;
  instruction: string;
  evaluationCriteria: string;
  severity: RuleSeverity;
}

/* ------------------------------------------------------------------ */
/*  Ruleset class                                                       */
/* ------------------------------------------------------------------ */

export class Ruleset {
  private readonly rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  /** All rules, optionally filtered by category */
  get(category?: RuleCategory): Rule[] {
    if (!category) return this.rules;
    return this.rules.filter((r) => r.category === category);
  }

  /** Find a single rule by stable id */
  byId(id: string): Rule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  /** Merge another Ruleset (later rules take precedence on duplicate ids) */
  extend(other: Ruleset): Ruleset {
    const merged = new Map(this.rules.map((r) => [r.id, r]));
    for (const r of other.rules) merged.set(r.id, r);
    return new Ruleset(Array.from(merged.values()));
  }

  /**
   * Render into a system prompt string block.
   * Groups rules by category with clear headings.
   */
  toPromptBlock(): string {
    const byCategory = new Map<string, Rule[]>();
    for (const rule of this.rules) {
      const list = byCategory.get(rule.category) ?? [];
      list.push(rule);
      byCategory.set(rule.category, list);
    }

    const sections: string[] = [];
    for (const category of Array.from(byCategory.keys())) {
      const categoryRules = byCategory.get(category) as Rule[];
      const heading = category.charAt(0).toUpperCase() + category.slice(1);
      const lines = categoryRules.map((r: Rule) => `- [${r.id}] ${r.instruction}`);
      sections.push(`**${heading}**\n${lines.join("\n")}`);
    }

    return `\n\n<rules>\n${sections.join("\n\n")}\n</rules>`;
  }

  /**
   * Export structured form for LLM-judge evaluation pipelines.
   * Pass this alongside a conversation to a judge model.
   */
  toEvaluationSpec(): Array<{
    id: string;
    category: RuleCategory;
    severity: RuleSeverity;
    evaluationCriteria: string;
  }> {
    return this.rules.map(({ id, category, severity, evaluationCriteria }) => ({
      id,
      category,
      severity,
      evaluationCriteria,
    }));
  }
}

/* ------------------------------------------------------------------ */
/*  Default portfolio-chat ruleset                                     */
/* ------------------------------------------------------------------ */

export const PORTFOLIO_CHAT_RULES = new Ruleset([
  // ── Formatting ──────────────────────────────────────────────────
  {
    id: "fmt-no-emdash",
    category: "formatting",
    instruction: "Do not use em-dashes (—). Use commas, colons, or rephrase instead.",
    evaluationCriteria: "The response contains no em-dash characters.",
    severity: "minor",
  },
  {
    id: "fmt-katex",
    category: "formatting",
    instruction:
      "Math must use KaTeX syntax only (not full LaTeX). Inline: $...$. Display: $$...$$. Example: $O(n \\log n)$, $$\\sum_{i=1}^{n} x_i$$.",
    evaluationCriteria:
      "All math expressions use $ or $$ delimiters and contain only KaTeX-compatible syntax.",
    severity: "major",
  },
  {
    id: "fmt-bold",
    category: "formatting",
    instruction:
      "Use **bold** for headers and titles. Use `backticks` for inline code. Use ```lang fences for code blocks.",
    evaluationCriteria:
      "Headers use **bold**, code is wrapped in backticks or fences. No raw ALL-CAPS headers or decorator-style formatting (e.g. ####TITLE####).",
    severity: "minor",
  },
  {
    id: "fmt-no-symbol-headers",
    category: "formatting",
    instruction:
      "Do not use symbol-as-format styles (e.g. ####TITLE#### or ===SECTION===). All structure must come from bold, KaTeX, or code fences.",
    evaluationCriteria: "Response contains no decorator-style section headers.",
    severity: "major",
  },
  {
    id: "fmt-paragraphs",
    category: "formatting",
    instruction:
      "Write in paragraphs. Bullet lists are only allowed if the content is genuinely enumerable. Prefer KaTeX for enumerating points of interest.",
    evaluationCriteria:
      "Non-enumerable content is written as prose. Bullet lists appear only for genuinely list-like content.",
    severity: "minor",
  },
  {
    id: "fmt-emoji",
    category: "formatting",
    instruction: "Use emojis sparingly where they add warmth or emphasis, not decoratively.",
    evaluationCriteria: "Emojis are used at most 1-2 times per response and add meaning.",
    severity: "minor",
  },

  // ── Conduct ─────────────────────────────────────────────────────
  {
    id: "conduct-verified-only",
    category: "conduct",
    instruction:
      "Only state information that is 100% verifiable from the loaded tool context or conversation history. Do not speculate, infer, or paraphrase logic unless the exact implementation is visible in tool results.",
    evaluationCriteria:
      "Every factual claim in the response can be traced to a tool result or explicit context in the conversation.",
    severity: "critical",
  },
  {
    id: "conduct-no-code-gen",
    category: "conduct",
    instruction:
      "Do not generate code, pseudocode, or implementation logic unless the exact code exists verbatim in a tool result (e.g. a GitHub file read).",
    evaluationCriteria:
      "The response contains no code blocks or pseudocode unless the content was retrieved verbatim from a tool result.",
    severity: "critical",
  },
  {
    id: "conduct-employer-tone",
    category: "conduct",
    instruction:
      "Treat the user as a potential employer or business connection. Advocate for the portfolio owner's skills and projects professionally.",
    evaluationCriteria:
      "The tone is professional and advocates for the portfolio owner without being sycophantic or vague.",
    severity: "major",
  },
  {
    id: "conduct-conversational",
    category: "conduct",
    instruction:
      "Be conversational and personable. Not every interaction needs to be strictly business. Connect with the user and personalize when appropriate.",
    evaluationCriteria:
      "The response feels natural and human, not robotic or templated.",
    severity: "minor",
  },
  {
    id: "conduct-concise",
    category: "conduct",
    instruction: "Keep responses concise. Prioritize quality over length.",
    evaluationCriteria:
      "The response does not pad with filler sentences or repeat information already stated.",
    severity: "minor",
  },

  // ── Tools ───────────────────────────────────────────────────────
  {
    id: "tools-research-first",
    category: "tools",
    instruction:
      "Before responding to any question requiring specific technical detail, use available tools to verify. Do not answer from prior knowledge alone when a tool can confirm.",
    evaluationCriteria:
      "Questions requiring project-specific technical detail show tool use before the final answer.",
    severity: "major",
  },
  {
    id: "tools-connect",
    category: "tools",
    instruction:
      "If a tool exists that can connect the user to the portfolio owner (e.g. email, contact form), proactively offer or use it when the user expresses interest in connecting.",
    evaluationCriteria:
      "Relevant connection opportunities are surfaced when user intent suggests interest.",
    severity: "minor",
  },
]);
