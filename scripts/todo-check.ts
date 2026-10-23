import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { extractTodoTasks, extractDoneTasks, noteRemarkPlugins, remarkTaskOnly, toggleTaskLine } from "../lib/note-tasks";

const body = ["# Tasks", "- [x] Done", "- [ ] Parent", "  - keep this reason",
  "  - [ ] Nested", "    - nested detail", "  - [X] Nested done", "- [ ] Same words",
  "- [ ] Same words", "", "```md", "- [ ] Not a task", "```", "", "> - [ ] Quoted",
  "", "1. [ ] Ordered", "", "    - [ ] Nested under ordered"].join("\r\n");
const tasks = extractTodoTasks(body);
assert.deepEqual(extractDoneTasks(body), [{ line: 2 }, { line: 7 }]);
assert.deepEqual(extractDoneTasks("```md\n- [x] Code\n```\n- [X] Done"), [{ line: 4 }]);
const restored = toggleTaskLine(body, 2);
assert.ok(extractTodoTasks(restored).some(({ line }) => line === 2));
assert.deepEqual(extractDoneTasks(restored), [{ line: 7 }]);
for (const { line } of extractDoneTasks(body)) {
  const processor = unified().use(remarkParse).use(noteRemarkPlugins).use(remarkTaskOnly, { line });
  const rendered = JSON.stringify(processor.runSync(processor.parse(body)));
  assert.equal((rendered.match(/"checked":true/g) ?? []).length, 1);
  assert.equal((rendered.match(/"checked":false/g) ?? []).length, 0);
}
assert.deepEqual(tasks.map(({ line }) => line), [3, 5, 8, 9, 15, 17, 19]);
assert.equal(new Set(tasks.map(({ line }) => line)).size, tasks.length);
for (const { line } of tasks) {
  const updated = toggleTaskLine(body, line);
  assert.deepEqual(extractTodoTasks(updated), tasks.filter((task) => task.line !== line));
  assert.equal(toggleTaskLine(updated, line), body, "toggle restores exact CRLF bytes");
  const processor = unified().use(remarkParse).use(noteRemarkPlugins).use(remarkTaskOnly, { line });
  const rendered = processor.runSync(processor.parse(body));
  const serialized = JSON.stringify(rendered);
  assert.equal((serialized.match(/"checked":false/g) ?? []).length, 1, "one interactive task per rendering");
  assert.equal((serialized.match(/"checked":true/g) ?? []).length, 0);
  if (line === 3) assert.ok(serialized.includes("keep this reason"));
  if (line === 5) assert.ok(serialized.includes("nested detail"));
}
assert.deepEqual(extractTodoTasks("- [x] Done\n- ordinary bullet\n`- [ ] inline code`"), []);
assert.deepEqual(extractTodoTasks("A paragraph.\n\n    - [ ] Indented code"), []);
const mixed = "- [ ] One\r\n- [ ] Two\n- [X] Three\r";
assert.equal(toggleTaskLine(mixed, 2), "- [ ] One\r\n- [x] Two\n- [X] Three\r");
console.log("PASS todo: unticked top-level/nested tasks exactly once, GFM exclusions, nested detail, source positions and byte-preserving toggles.");
