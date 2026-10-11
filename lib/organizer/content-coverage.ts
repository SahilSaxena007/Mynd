import { sentences } from "./split-coverage";

function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
}

export function hasDroppedContent(itemText: string, writtenText: string, targetBody = "",
  thresholds = { coverage: 0.6, consecutive: 3 }): boolean {
  const written = new Set(words(writtenText));
  // Spaces enforce whole-word boundaries when checking an already-present sentence.
  const existing = ` ${words(targetBody).join(" ")} `;
  let total = 0;
  let matched = 0;
  let consecutive = 0;
  for (const { start, end } of sentences(itemText)) {
    const sentence = words(itemText.slice(start, end));
    // Empty/short-word-only segments carry no evidence and do not interrupt a block.
    if (!sentence.length) continue;
    const hits = sentence.filter((word) => written.has(word)).length;
    total += sentence.length;
    matched += hits;
    const represented = hits / sentence.length >= 0.7 || existing.includes(` ${sentence.join(" ")} `);
    consecutive = represented ? 0 : consecutive + 1;
    if (consecutive >= thresholds.consecutive) return true;
  }
  return total > 0 && matched / total < thresholds.coverage;
}
