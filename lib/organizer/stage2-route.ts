import { complete } from "../model";
import { routePrompt } from "../prompts/route";
import { routeInput, type RunRefs } from "./refs";
import { routeSchema, type RoutePlan } from "./route-types";

export const ROUTE_MAX_TOKENS = 16_000;

export async function routeItems(refs: RunRefs) {
  return complete<RoutePlan>({ job: "route", system: routePrompt,
    user: JSON.stringify(routeInput(refs)), schema: routeSchema, maxTokens: ROUTE_MAX_TOKENS });
}
