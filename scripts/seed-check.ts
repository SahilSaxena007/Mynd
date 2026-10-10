import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSeedFolders, SEED_FOLDERS, INBOX_DESC, JOURNAL_DESC } from "../lib/db/seed";

async function main() {
  const directory = await mkdtemp(join(tmpdir(), "mynd-seed-check-"));
  const previous = process.env.SEED_FOLDERS_FILE;
  try {
    delete process.env.SEED_FOLDERS_FILE;
    assert.deepEqual(await loadSeedFolders(), SEED_FOLDERS);
    assert.equal((await loadSeedFolders()).length, 7);
    const file = join(directory, "folders.json");
    process.env.SEED_FOLDERS_FILE = file;
    const custom = { name: "Garden", slug: "garden", color: "#7a9c73", description: "Garden projects." };
    await writeFile(file, JSON.stringify([custom]));
    const folders = await loadSeedFolders();
    assert.deepEqual(folders.map((folder) => folder.slug), ["garden", "journal", "inbox"]);
    assert.deepEqual(folders[0], custom);
    assert.equal(folders[1].description, JOURNAL_DESC);
    assert.equal(folders[2].description, INBOX_DESC);
    await writeFile(file, JSON.stringify([{ ...custom, slug: "inbox" }, { ...custom, slug: "journal" }]));
    assert.equal((await loadSeedFolders()).length, 2);
    const invalid: unknown[] = [{}, [null], [custom, custom], [{ ...custom, slug: "Bad slug" }],
      [{ ...custom, color: "red" }], [{ ...custom, color: "#abc" }]];
    for (const field of ["name", "slug", "color", "description"]) {
      for (const value of ["", "  ", null, 42]) invalid.push([{ ...custom, [field]: value }]);
    }
    for (const input of invalid) {
      await writeFile(file, JSON.stringify(input));
      await assert.rejects(loadSeedFolders());
    }
    await writeFile(file, "not JSON");
    await assert.rejects(loadSeedFolders());
    await assert.rejects(loadSeedFolders(join(directory, "missing.json")));
    console.log("PASS seed: custom folders and defaults, reserved slugs, invalid fields/files, unset seven; no database writes.");
  } finally {
    if (previous === undefined) delete process.env.SEED_FOLDERS_FILE;
    else process.env.SEED_FOLDERS_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
