// Compare digit runs as strings: no rounding, word conversion, or time inference.
export function digitRuns(text: string): string[] {
  return [...new Set((text.match(/\d+/g) ?? []).map((digits) => digits.replace(/^0+(?=\d)/, "")))];
}

export function unverifiedNumbers(written: string, source: string): string[] {
  const said = new Set(digitRuns(source));
  return digitRuns(written).filter((number) => !said.has(number));
}
