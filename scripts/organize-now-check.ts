import assert from "node:assert/strict";
import { POST } from "../app/api/organize/route";
import { withDatabase } from "../lib/db/client";
import { organizeNowCheckDatabase } from "../lib/db/organize-now-check-support";
import { withOrganizeLock } from "../lib/db/organize-lock";

export async function checkOrganizeNow(pass: (label: string) => void) {
  const previous = process.env.SECRET_TOKEN;
  process.env.SECRET_TOKEN = "offline-organise-token";
  const request = () => new Request("http://localhost/api/organize", {
    method: "POST", headers: { SECRET_TOKEN: "offline-organise-token" },
  });
  const db = organizeNowCheckDatabase();
  try {
    await withDatabase(db.pool, async () => {
      assert.equal((await POST(new Request("http://localhost/api/organize", { method: "POST" }))).status, 401);
      assert.equal(db.state.releases.length, 0);
      db.state.busy = true;
      assert.equal((await POST(request())).status, 409);
      assert.equal(db.state.gathers, 0);
      assert.equal(db.state.records.length, 0);
      assert.equal(db.state.unlocks, 0);
      pass("organise-now rejects missing token and busy lock before running organiser");
      db.state.busy = false;
      db.state.last = new Date();
      assert.equal((await POST(request())).status, 429);
      assert.equal(db.state.gathers, 0);
      assert.equal(db.state.records.length, 0);
      assert.equal(db.state.unlocks, 1);
      pass("recent button run returns 429 inside lock without running organiser");
      db.state.last = new Date(Date.now() - 120_001);
      const response = await POST(request());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "nothing_pending" });
      assert.equal(db.state.records.length, 1);
      assert.equal(db.state.records[0][0], "button");
      assert.equal(db.state.records[0][1], "nothing_pending");
      assert.equal(db.state.gathers, 4);
      pass("expired cooldown permits empty run, records button trigger, makes zero model calls");
      await assert.rejects(withOrganizeLock(async () => { throw new Error("sanitized failure"); }), /sanitized failure/);
      assert.equal(db.state.unlocks, 3);
      db.state.failUnlock = true;
      await withOrganizeLock(async () => undefined);
      assert.equal(db.state.releases.at(-1), true);
      pass("lock releases on callback failure and discards connection on unlock failure");
    });
  } finally {
    if (previous === undefined) delete process.env.SECRET_TOKEN;
    else process.env.SECRET_TOKEN = previous;
  }
}
