"use client";

import { createContext, useContext } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SourceLine = createContext<number | undefined>(undefined);

// Only inspect the selected source line, never search for an item's text.
export function toggleTaskLine(body: string, line: number): string {
  // Capturing separators retains CRLF/LF bytes, even in a mixed-newline note.
  const lines = body.split(/(\r\n|\n|\r)/);
  const index = (line - 1) * 2;
  const source = lines[index];
  if (source === undefined) return body;
  lines[index] = source.replace(/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/, (_match, prefix, marker, suffix) =>
    `${prefix}${marker === " " ? "x" : " "}${suffix}`);
  return lines.join("");
}

function TaskCheckbox({ checked, disabled, onToggle }: {
  checked: boolean; disabled: boolean; onToggle?: (line: number) => void;
}) {
  const line = useContext(SourceLine);
  return <input type="checkbox" checked={checked} disabled={disabled || !line || !onToggle}
    aria-label={`Task on line ${line ?? "unknown"}`} data-source-line={line}
    onChange={() => { if (line) onToggle?.(line); }}
    style={{ width: 24, height: 24, margin: "10px 8px 10px 0", verticalAlign: "middle" }} />;
}

export default function NoteBody({ body, disabled = false, onToggle }: {
  body: string; disabled?: boolean; onToggle?: (line: number) => void;
}) {
  return <div style={{ overflowWrap: "anywhere", overflowX: "auto" }}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      li: ({ node, children, ...props }) => <SourceLine.Provider value={node?.position?.start.line}>
        <li {...props}>{children}</li>
      </SourceLine.Provider>,
      input: ({ checked }) => <TaskCheckbox checked={!!checked} disabled={disabled} onToggle={onToggle} />,
    }}>{body}</Markdown>
  </div>;
}
