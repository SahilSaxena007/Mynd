export type SplitItem = { topic: string; quotes: string[]; unassigned: boolean };
export type ModelSplitItem = { topic: string; quotes: string[] };
type Span = { start: number; end: number };

function sentences(text: string): Span[] {
  const result: Span[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === "\n" || text[at] === "\r"
      || (/[.?!]/u.test(text[at]) && (at + 1 === text.length || /\s/u.test(text[at + 1])))) {
      result.push({ start, end: at + 1 });
      start = at + 1;
    }
  }
  if (start < text.length) result.push({ start, end: text.length });
  return result;
}

// Each normalized UTF-16 unit maps to a complete original character/whitespace run.
function normalize(source: string) {
  let text = "";
  const positions: Span[] = [];
  for (let start = 0; start < source.length;) {
    const character = String.fromCodePoint(source.codePointAt(start)!);
    let end = start + character.length;
    let normalized: string;
    if (/\s/u.test(character)) {
      while (end < source.length && /\s/u.test(source[end])) end++;
      normalized = " ";
    } else {
      normalized = character.replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
        .replace(/…/gu, "...").toLowerCase();
    }
    text += normalized;
    for (let i = 0; i < normalized.length; i++) positions.push({ start, end });
    start = end;
  }
  return { text, positions };
}

export function completeSplit(captureBody: string, modelItems: ModelSplitItem[]) {
  const source = normalize(captureBody);
  const owners = Array.from({ length: captureBody.length }, () => new Set<number>());
  const ordered: { item: SplitItem; start: number }[] = [];
  const rejectedQuotes: string[] = [];
  let overlaps = 0;
  modelItems.forEach((item, itemIndex) => {
    for (const quote of item.quotes) {
      const needle = normalize(quote).text;
      let selected: Span | undefined;
      if (needle.length) {
        for (let at = source.text.indexOf(needle); at !== -1; at = source.text.indexOf(needle, at + 1)) {
          const last = at + needle.length - 1;
          // Do not match only part of an expanded character (e.g. one dot of an ellipsis).
          if ((at > 0 && source.positions[at - 1].start === source.positions[at].start)
            || (last + 1 < source.positions.length && source.positions[last + 1].end === source.positions[last].end)) continue;
          const span = { start: source.positions[at].start, end: source.positions[last].end };
          selected ??= span;
          if (owners.slice(span.start, span.end).every((claimed) => claimed.size === 0)) {
            selected = span;
            break;
          }
        }
      }
      if (!selected) { rejectedQuotes.push(quote); continue; }
      // Count each passage overlapping an earlier, different item's claim once.
      if (owners.slice(selected.start, selected.end).some((claimed) =>
        [...claimed].some((owner) => owner !== itemIndex))) overlaps++;
      for (let i = selected.start; i < selected.end; i++) owners[i].add(itemIndex);
    }
  });

  // Keep the diagnostic about MODEL claims, before code absorbs any text.
  const modelClaimed = owners.map((claimed) => claimed.size > 0);
  const segments = sentences(captureBody);
  const absorbedSpans = { sentenceIntegrity: 0, singleHome: 0 };
  for (const segment of segments) {
    for (let start = segment.start; start < segment.end;) {
      if (owners[start].size) { start++; continue; }
      let end = start + 1;
      while (end < segment.end && !owners[end].size) end++;
      const neighbour = start > segment.start ? owners[start - 1] : end < segment.end ? owners[end] : undefined;
      if (neighbour?.size) {
        const owner = neighbour.values().next().value!;
        for (let at = start; at < end; at++) owners[at].add(owner);
        absorbedSpans.sentenceIntegrity++;
      }
      start = end;
    }
  }
  const segmentOwners = segments.map(({ start, end }) => new Set(owners.slice(start, end).flatMap((entry) => [...entry])));
  for (let first = 0; first < segments.length;) {
    if (segmentOwners[first].size) { first++; continue; }
    let after = first + 1;
    while (after < segments.length && !segmentOwners[after].size) after++;
    const neighbours = new Set([...(segmentOwners[first - 1] ?? []), ...(segmentOwners[after] ?? [])]);
    if (neighbours.size === 1) {
      const owner = neighbours.values().next().value!;
      for (let at = segments[first].start; at < segments[after - 1].end; at++) owners[at].add(owner);
      absorbedSpans.singleHome++;
    }
    first = after;
  }
  // Rebuild quotes from original character ranges, including only owned text.
  modelItems.forEach((item, owner) => {
    const passages: Span[] = [];
    for (let start = 0; start < captureBody.length;) {
      if (!owners[start].has(owner)) { start++; continue; }
      let end = start + 1;
      while (end < captureBody.length && owners[end].has(owner)) end++;
      passages.push({ start, end });
      start = end;
    }
    if (passages.length) ordered.push({ start: passages[0].start, item: {
      topic: item.topic.toLowerCase(), quotes: passages.map(({ start, end }) => captureBody.slice(start, end)), unassigned: false,
    } });
  });
  for (let start = 0; start < captureBody.length;) {
    if (owners[start].size) { start++; continue; }
    let end = start + 1;
    while (end < captureBody.length && !owners[end].size) end++;
    const text = captureBody.slice(start, end);
    if (/[\p{L}\p{N}]/u.test(text)) ordered.push({ start, item: {
      topic: "unassigned", quotes: [text], unassigned: true,
    } });
    start = end;
  }
  let meaningful = 0;
  let claimed = 0;
  // Meaningful characters are Unicode letters/numbers; punctuation and spacing don't inflate coverage.
  for (let at = 0; at < captureBody.length;) {
    const character = String.fromCodePoint(captureBody.codePointAt(at)!);
    if (/[\p{L}\p{N}]/u.test(character)) {
      meaningful++;
      if (modelClaimed[at]) claimed++;
    }
    at += character.length;
  }
  ordered.sort((a, b) => a.start - b.start);
  return { items: ordered.map(({ item }) => item),
    claimedFraction: meaningful ? claimed / meaningful : 1, rejectedQuotes, overlaps, absorbedSpans };
}
