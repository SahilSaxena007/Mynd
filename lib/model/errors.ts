export class ModelProviderError extends Error {
  constructor(public readonly status: number | undefined, public readonly type: string, message: string) {
    super(message);
    this.name = "ModelProviderError";
  }
}

// Existing project errors are plain Error objects. Only allow known, fixed messages
// through; arbitrary Error/SyntaxError messages may contain capture text.
export function formatPreviewError(error: unknown): string {
  if (error instanceof ModelProviderError) {
    return `FAIL: HTTP ${error.status ?? "unknown"} ${error.type}: ${error.message}`;
  }
  const messages = new Set([
    "MODEL_PROVIDER must be anthropic.", "Model environment setting is required.",
    "ROUTE_THINKING_BUDGET must be 0, or an integer >= 1024 and below route maxTokens.",
    "Saved plan contains unverified numbers; review a new dry run before applying.",
    "No cost rates configured for the selected model.", "Invalid model token usage.",
    "Model response incomplete or refused.", "Model response did not match the output schema.",
    "Choose --id or --limit, not both.", "--id must be a UUID.",
    "--limit must be a positive integer.", "No pending capture with that id.",
    "DATABASE_URL is required. Set it in .env.",
    "Nested transactions are not supported.",
    "Transaction has ended. Await every query in its callback.",
    "Transaction was aborted; no changes were committed.",
  ]);
  const guardMessage = /^Model call refused: (?:active withModelRun required|model run is closed|maxTokens invalid|(?:MAX_TOKENS_PER_CALL|MAX_CALLS_PER_RUN|DAILY_CALL_CAP) (?:missing or invalid|invalid|exceeded|count unavailable))\.$/;
  const incompleteMessage = /^Model response incomplete or refused \(stop_reason: (?:max_tokens|refusal|stop_sequence|tool_use|pause_turn|model_context_window_exceeded|null)\)\.$/;
  if (error instanceof Error && (messages.has(error.message) || guardMessage.test(error.message) || incompleteMessage.test(error.message))) {
    return `FAIL: ${error.message}`;
  }
  return `FAIL: ${error instanceof Error ? error.name : "UnknownError"}`;
}
