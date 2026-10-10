"use client";

import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import { useVault } from "@/components/vault-data";
import { folderColor } from "@/components/folder-colors";
import { extractTodoTasks } from "@/lib/note-tasks";

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  for (const [size, unit] of [[86400, "day"], [3600, "hour"], [60, "minute"]] as const) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

function Vault() {
  const { vault, error } = useVault();
  const todoCount = vault?.notes.reduce((count, note) => count + extractTodoTasks(note.body).length, 0) ?? 0;
  return <main style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui, sans-serif", fontSize: 17, lineHeight: 1.6, background: "white", color: "#222", overflowWrap: "anywhere" }}>
    <style jsx>{`main :global(a) { color: #245bc4; }`}</style>
    <h1>Vault</h1>
    {error ? <p role="alert">{error}</p> : !vault ? <p role="status">Loading…</p> : <>
      {vault.lastRun ? <p role={vault.lastRun.status === "failed" ? "alert" : undefined}>
        {vault.lastRun.status === "failed"
          ? "Organising didn't finish \u2014 your thoughts are safe and will be filed next run."
          : <>Last organised <time dateTime={vault.lastRun.finishedAt}>{relativeTime(vault.lastRun.finishedAt)}</time></>}
      </p> : <p>Not organised yet.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 16 }}>
        {vault.folders.map((folder) => {
          const count = vault.notes.filter((note) => note.folderId === folder.id).length;
          return <Link key={folder.id} href={`/folder/${encodeURIComponent(folder.slug)}`}
            style={{ border: "1px solid #ccc", borderTop: `12px solid ${folderColor(folder)}`, color: "inherit", textDecoration: "none", padding: 20, borderRadius: 8 }}>
            <h2>{folder.name}</h2><span>{count} {count === 1 ? "note" : "notes"}</span>
          </Link>;
        })}
      </div>
      <p><Link href="/quick-calls">{vault.openQuickCalls} {vault.openQuickCalls === 1 ? "item needs" : "items need"} a decision</Link>
        {todoCount > 0 && <> · <Link href="/todo">To do ({todoCount})</Link></>}</p>
    </>}
  </main>;
}

export default function Home() {
  return <TokenGate><Vault /></TokenGate>;
}
