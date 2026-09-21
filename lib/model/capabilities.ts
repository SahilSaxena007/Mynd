export const capabilities: Readonly<Record<string, { supportsTemperature: boolean; thinking: "budget" | "adaptive" | "none" }>> = {
  "claude-haiku-4-5": { supportsTemperature: true, thinking: "budget" },
  "claude-sonnet-5": { supportsTemperature: false, thinking: "adaptive" },
};

export function routeThinkingBudget(value: string | undefined, maxTokens: number): number {
  const budget = value === undefined ? 2048 : /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(budget) || (budget !== 0 && (budget < 1024 || budget >= maxTokens))) {
    throw new Error("ROUTE_THINKING_BUDGET must be 0, or an integer >= 1024 and below route maxTokens.");
  }
  return budget;
}

export function routeParameters(model: string, maxTokens: number, budgetValue: string | undefined): {
  temperature?: number; thinking?: { type: "enabled"; budget_tokens: number };
} {
  const budget = routeThinkingBudget(budgetValue, maxTokens);
  if (!Object.hasOwn(capabilities, model) || capabilities[model].thinking !== "budget") {
    throw new Error(`Routing is unsupported for model ${model}; a budget-thinking model is required.`);
  }
  return budget > 0 ? { thinking: { type: "enabled", budget_tokens: budget } } : { temperature: 0 };
}

export function samplingParameters(model: string, job: string): {
  temperature?: number; thinking?: { type: "disabled" };
} {
  if (job === "answer" && Object.hasOwn(capabilities, model) && capabilities[model].thinking === "adaptive") {
    return { thinking: { type: "disabled" } };
  }
  return (job === "split" || job === "route") && Object.hasOwn(capabilities, model)
    && capabilities[model].supportsTemperature ? { temperature: 0 } : {};
}
