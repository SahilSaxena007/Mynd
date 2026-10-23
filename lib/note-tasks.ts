import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Nodes, ListItem } from "mdast";

// NoteBody and extraction use the same GFM parser, including fenced code and nesting.
export const noteRemarkPlugins = [remarkGfm];
const parser = unified().use(remarkParse).use(noteRemarkPlugins);

function taskItems(node: Nodes): ListItem[] {
  const own = node.type === "listItem" && typeof node.checked === "boolean" ? [node] : [];
  return [...own, ...("children" in node ? node.children.flatMap(taskItems) : [])];
}

export function extractTodoTasks(body: string): { line: number }[] {
  return taskItems(parser.parse(body)).filter((item) => item.checked === false)
    .map((item) => ({ line: item.position!.start.line }));
}

export function extractDoneTasks(body: string): { line: number }[] {
  return taskItems(parser.parse(body)).filter((item) => item.checked === true)
    .map((item) => ({ line: item.position!.start.line }));
}

// Render one task with its ordinary nested detail, but render nested tasks separately.
// Original positions survive so every checkbox still addresses the saved source line.
export function remarkTaskOnly({ line }: { line: number }) {
  return (tree: Root) => {
    const item = taskItems(tree).find((entry) => entry.position?.start.line === line);
    tree.children = [];
    if (!item) return;
    const copy = structuredClone(item);
    function removeNestedTasks(node: Nodes) {
      if (!("children" in node)) return;
      node.children = node.children.filter((child) =>
        child.type !== "listItem" || typeof child.checked !== "boolean") as typeof node.children;
      node.children.forEach(removeNestedTasks);
    }
    copy.children.forEach(removeNestedTasks);
    tree.children = [{ type: "list", ordered: false, spread: false, children: [copy] }];
  };
}

// Only inspect the selected source line, never search for an item's text.
export function toggleTaskLine(body: string, line: number): string {
  const lines = body.split(/(\r\n|\n|\r)/);
  const index = (line - 1) * 2;
  const source = lines[index];
  if (source === undefined) return body;
  lines[index] = source.replace(/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/, (_match, prefix, marker, suffix) =>
    `${prefix}${marker === " " ? "x" : " "}${suffix}`);
  return lines.join("");
}
