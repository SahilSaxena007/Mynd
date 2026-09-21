import { getCapturesByIds, getNoteSummaries } from "../db/queries";
import type { Ask } from "../db/types";

// Resolve display text on read; the stored citation remains just kind, id and ref.
export async function citationLabels(asks: Ask[]): Promise<Record<string, string>> {
  const citations = asks.flatMap((ask) => ask.citations);
  const [notes, captures] = await Promise.all([
    getNoteSummaries(),
    getCapturesByIds([...new Set(citations.filter((c) => c.kind === "capture").map((c) => c.id))]),
  ]);
  return Object.fromEntries([
    ...notes.filter((note) => citations.some((c) => c.kind === "note" && c.id === note.id))
      .map((note) => [note.id, note.title]),
    ...captures.map((capture) => [capture.id, capture.body]),
  ]);
}
