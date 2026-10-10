import { sentences } from "./split-coverage";

function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
}

export function hasDroppedContent(itemText: string, markdown: string, targetBody = ""): boolean {
  const written = new Set(words(markdown));
  // Spaces enforce whole-word boundaries when checking an already-present sentence.
  const existing = ` ${words(targetBody).join(" ")} `;
  return sentences(itemText).some(({ start, end }) => {
    const sentence = words(itemText.slice(start, end));
    if (!sentence.length) return false;
    if (sentence.filter((word) => written.has(word)).length / sentence.length >= 0.7) return false;
    return !existing.includes(` ${sentence.join(" ")} `);
  });
}
