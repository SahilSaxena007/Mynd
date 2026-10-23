import assert from "node:assert/strict";
import { withDatabase } from "../lib/db/client";
import { foldersCheckDatabase } from "../lib/db/folders-check-support";
import { createUserFolder, updateUserFolder, FolderError } from "../lib/db/folders";
import { DEFAULT_GROUPING, JOURNAL_DESC, INBOX_DESC } from "../lib/db/seed";
import { FOLDER_PALETTE } from "../components/folder-colors";
import { POST } from "../app/api/folders/route";
import { PATCH } from "../app/api/folders/[slug]/route";

async function main() {
  const db = foldersCheckDatabase();
  const previousToken = process.env.SECRET_TOKEN;
  process.env.SECRET_TOKEN = "offline-folders-token";
  try { await withDatabase(db.pool, async () => {
    const create = async (name: string, description = "Travel plans") => {
      const result = await createUserFolder({ name, description });
      assert.ok(result.folder);
      return result.folder;
    };
    const travel = await create(" Travel! ");
    assert.equal(travel.slug, "travel");
    assert.equal(travel.description, `Travel plans ${DEFAULT_GROUPING}`);
    assert.equal(travel.color, FOLDER_PALETTE[0]);
    assert.equal((await create("Travel?")).slug, "travel-2");
    assert.equal((await create("Travel.")).slug, "travel-3");
    assert.equal((await create("🌍")).slug, "folder");
    const grouped = await create("Custom", "Plans grouping: One trip per note.");
    assert.equal(grouped.description, "Plans grouping: One trip per note.");
    await assert.rejects(create("travel!"), (e: unknown) => e instanceof FolderError && e.status === 409);
    const edited = await updateUserFolder("travel", { name: "Trips", description: travel.description, color: FOLDER_PALETTE[3] });
    assert.equal(edited.slug, "travel");
    assert.equal(edited.description, travel.description);
    assert.equal(edited.color, FOLDER_PALETTE[3]);
    await assert.rejects(updateUserFolder("travel", { name: "custom", description: "Plans" }), /already have/);
    for (const [name, description] of [["Journal", JOURNAL_DESC], ["Inbox", INBOX_DESC]]) {
      const folder = await create(name, description);
      await assert.rejects(updateUserFolder(folder.slug, { name, description: "New rule" }), /rule is fixed/);
      assert.equal((await updateUserFolder(folder.slug, { name: `${name} renamed`, description })).description, description);
    }
    const long = await create("Long", "x".repeat(300));
    assert.equal((await updateUserFolder(long.slug, { name: "Long renamed", description: long.description })).description, long.description);
    for (const input of [{ name: "" }, { name: "x", description: "" }, { name: "x".repeat(41), description: "x" },
      { name: "x", description: "x".repeat(301) }, { name: "x", description: "x", color: "red" }]) {
      await assert.rejects(createUserFolder(input), FolderError);
    }
    await create("Ninth");
    await create("Tenth");
    const input = { name: "Eleventh", description: "Plans" };
    assert.deepEqual(await createUserFolder(input), { needsConfirm: true, count: 10 });
    assert.deepEqual(await createUserFolder({ ...input, confirmOverLimit: "true" }), { needsConfirm: true, count: 10 });
    assert.equal(db.state.folders.length, 10);
    assert.ok((await createUserFolder({ ...input, confirmOverLimit: true })).folder);
    assert.deepEqual(await createUserFolder({ name: "Twelfth", description: "Plans" }), { needsConfirm: true, count: 11 });
    const request = (body: unknown, token = "offline-folders-token", method = "POST") => new Request("http://localhost/api/folders", {
      method, headers: { SECRET_TOKEN: token, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await POST(request(input, "wrong"))).status, 401);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(request(input))).status, 409);
    assert.equal((await POST(request({ name: "Twelfth", description: "Plans" }))).status, 200);
    assert.equal((await POST(request({ name: "Twelfth", description: "Plans", confirmOverLimit: true }))).status, 201);
    assert.equal((await PATCH(request({ name: "Gone", description: "Plans" }, undefined, "PATCH"), { params: Promise.resolve({ slug: "missing" }) })).status, 404);
    assert.ok(db.state.locks.every((key) => key === 715004));
    console.log("PASS folders: validation, slug collisions, grouping, palette, soft limit, edits, fixed rules, auth and HTTP statuses (offline).");
  }); } finally {
    if (previousToken === undefined) delete process.env.SECRET_TOKEN;
    else process.env.SECRET_TOKEN = previousToken;
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
