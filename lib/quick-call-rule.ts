import type { QuickCallInput } from "./db/types";

export function suggestedRule(call: Pick<QuickCallInput, "subject" | "topic" | "reason">, destination: string): string {
  if (!call.subject.trim() || call.topic === "unassigned" || call.reason === "not_placed") return "";
  return `${call.subject} go in ${destination}.`;
}
