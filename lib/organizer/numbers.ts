// Compare digit runs as strings: no rounding or time inference.
export function digitRuns(text: string): string[] {
  return [...new Set((text.match(/\d+/g) ?? []).map((digits) => digits.replace(/^0+(?=\d)/, "")))];
}

export function unverifiedNumbers(written: string, source: string): string[] {
  const said = new Set(digitRuns(source));
  const words = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
  const values = new Map(words.map((word, index) => [word, String(index)]));
  "thirty forty fifty sixty seventy eighty ninety hundred".split(" ").forEach((word, index) => values.set(word, String(30 + index * 10)));
  "first second third fourth fifth sixth seventh eighth ninth tenth".split(" ").forEach((word, index) => values.set(word, String(index + 1)));
  for (const word of source.toLowerCase().match(/\b[a-z]+\b/g) ?? []) {
    const value = values.get(word);
    if (value !== undefined) said.add(value);
  }
  return digitRuns(written).filter((number) => !said.has(number));
}
