import assert from "node:assert/strict";
import { GET, POST } from "../app/api/note/[id]/route";
import { withDatabase } from "../lib/db/client";
import { tidyCheckDatabase } from "../lib/db/tidy-check-support";
import { applyTidy } from "../lib/db/tidy";
import type { EditableNote } from "../lib/db/queries";

export async function checkNoteVersionApi(seed: EditableNote) {
  const previous = process.env.SECRET_TOKEN;
  process.env.SECRET_TOKEN = "offline-note-version-check";
  const a = { ...seed, id: "00000000-0000-4000-8000-000000000001" };
  const b = { ...seed, id: "00000000-0000-4000-8000-000000000002" };
  const db = tidyCheckDatabase([a, b]);
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const request = (body: unknown, authenticated = true) => new Request("http://offline/api/note", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { SECRET_TOKEN: process.env.SECRET_TOKEN! } : {}) },
    body: JSON.stringify(body),
  });
  try {
    await withDatabase(db.pool, async () => {
      assert.equal((await POST(request({ action: "archive", updatedAt: a.updatedAt }, false), context(a.id))).status, 401);
      assert.equal(db.events.length, 0);
      assert.equal((await POST(request({ action: "unknown", updatedAt: a.updatedAt }), context(a.id))).status, 400);
      assert.equal((await POST(request({ action: "restore", updatedAt: a.updatedAt }), context(a.id))).status, 400);
      await applyTidy({ note: a.id, absorbs: [b.id], title: a.title, summary: a.summary!, body: a.body }, [a, b]);
      const response = await GET(request({}), context(b.id));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const loaded = await response.json();
      assert.equal(loaded.note.archivedInto, a.id);
      assert.equal(loaded.mergedTitle, a.title);
      assert.equal(loaded.version.reason, "merge");
      assert.equal(loaded.version.body, b.body);
      assert.equal((await POST(request({ action: "unarchive", updatedAt: b.updatedAt }), context(b.id))).status, 409);
      const restored = await POST(request({ action: "unarchive", updatedAt: loaded.note.updatedAt }), context(b.id));
      assert.equal(restored.status, 200);
      assert.equal((await restored.json()).note.archivedAt, null);
      const missing = await GET(request({}), context("00000000-0000-4000-8000-000000000099"));
      assert.equal(missing.status, 404);
    });
    console.log("PASS note API: authentication, action validation, archived URL, previous version, merge link and conflict-safe restore");
  } finally {
    if (previous === undefined) delete process.env.SECRET_TOKEN;
    else process.env.SECRET_TOKEN = previous;
  }
}
