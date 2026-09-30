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
    style={{ width: 24, height: 24, accentColor: "#245bc4", margin: "4px 8px 4px 0", verticalAlign: "middle" }} />;
}

export default function NoteBody({ body, disabled = false, onToggle }: {
  body: string; disabled?: boolean; onToggle?: (line: number) => void;
}) {
  return <div className="note-body" style={{ overflowWrap: "anywhere", overflowX: "auto" }}>
    <style jsx>{`
      .note-body :global(h2) { font-size: 1.5rem; line-height: 1.3; margin: 1.6em 0 0.6em; }
      .note-body :global(h3) { font-size: 1.2rem; line-height: 1.4; margin: 1.4em 0 0.5em; }
      .note-body :global(ul), .note-body :global(ol) { padding-left: 1.6em; }
      .note-body :global(li) { margin: 0.3em 0; }
      .note-body :global(li > ul), .note-body :global(li > ol) { margin: 0.2em 0; }
      .note-body :global(a) { color: #245bc4; }
      .note-body :global(pre) { white-space: pre-wrap; }
      .note-body :global(img) { max-width: 100%; height: auto; }
    `}</style>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      li: ({ node, children, ...props }) => <SourceLine.Provider value={node?.position?.start.line}>
        <li {...props}>{children}</li>
      </SourceLine.Provider>,
      input: ({ checked }) => <TaskCheckbox checked={!!checked} disabled={disabled} onToggle={onToggle} />,
    }}>{body}</Markdown>
  </div>;
}
