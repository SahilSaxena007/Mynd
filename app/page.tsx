"use client";

import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import { folderColor } from "@/components/folder-colors";
import { useVault } from "@/components/vault-data";

function Vault() {
  const { vault, error } = useVault();
  return <main>
    <h1>Vault</h1>
    {error ? <p role="alert">{error}</p> : !vault ? <p role="status">Loading…</p> : <>
      {vault.lastRun ? <p role={vault.lastRun.status === "failed" ? "alert" : undefined}>
        {vault.lastRun.status === "failed" ? "Last organise attempt" : "Last organised"}{" "}
        <time dateTime={vault.lastRun.finishedAt}>{new Date(vault.lastRun.finishedAt).toLocaleString()}</time>
        {vault.lastRun.status === "failed" ? ` — failed: ${vault.lastRun.error}`
          : vault.lastRun.status === "nothing_pending" ? " — nothing pending."
            : ` — ${vault.lastRun.capturesProcessed} captures processed, ${vault.lastRun.itemsFiled} items filed, ${vault.lastRun.itemsQueued} queued; ${vault.lastRun.notesCreated} notes created, ${vault.lastRun.notesAppended} appended.`}
        {` Cost $${vault.lastRun.costUsd.toFixed(6)}.`}
        {vault.lastRun.failedCaptureId && " One capture was marked failed; its text is still in Captures."}
      </p> : <p>Not organised yet.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
        {vault.folders.map((folder) => {
          const count = vault.notes.filter((note) => note.folderId === folder.id).length;
          return <Link key={folder.id} href={`/folder/${encodeURIComponent(folder.slug)}`}
            style={{ border: "1px solid #ccc", borderTop: `12px solid ${folderColor(folder)}`, padding: 20, color: "inherit", borderRadius: 8 }}>
            <h2>{folder.name}</h2><span>{count} {count === 1 ? "note" : "notes"}</span>
          </Link>;
        })}
      </div>
      <p>{vault.openQuickCalls} {vault.openQuickCalls === 1 ? "item needs" : "items need"} a decision — Quick Calls arrive in slice 6.</p>
    </>}
  </main>;
}

export default function Home() {
  return <TokenGate><Vault /></TokenGate>;
}
