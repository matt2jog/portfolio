/**
 * Tool interface — any capability an Agent can invoke mid-conversation.
 *
 * Implementations provide a JSON-schema description (so the LLM knows
 * how/when to call them) and an `execute()` that does the actual work.
 */

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export abstract class Tool {
  abstract readonly name: string;
  abstract readonly definition: ToolDefinition;

  /**
   * Execute the tool with the given arguments (parsed from the LLM's
   * tool_call). Returns a string result that gets fed back into the
   * conversation as a tool message.
   */
  abstract execute(args: Record<string, unknown>): Promise<string>;

  /** Convenience — returns the OpenAI-shaped tool descriptor for the API. */
  toJSON(): { type: "function"; function: ToolDefinition } {
    return { type: "function", function: this.definition };
  }
}
