"use client";

import Link from "next/link";
import { useState } from "react";
import TokenGate from "@/components/TokenGate";
import { useVault, vaultFetch } from "@/components/vault-data";
import { folderColor } from "@/components/folder-colors";
import { extractTodoTasks } from "@/lib/note-tasks";
import FolderForm from "@/components/FolderForm";
import { quickCallsCopy } from "@/lib/quick-calls-copy";

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
  const { vault, error, reload } = useVault();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderMessage, setFolderMessage] = useState("");
  const [organising, setOrganising] = useState(false);
  const [organizeMessage, setOrganizeMessage] = useState("");
  async function organise() {
    setOrganising(true);
    setOrganizeMessage("");
    try {
      const response = await vaultFetch("/api/organize", { method: "POST" });
      if (response.status === 401) return;
      const result = await response.json();
      setOrganizeMessage(response.ok
        ? result.status === "nothing_pending" ? "Nothing waiting to organise."
          : `Filed ${result.filed} thoughts.${result.queued > 0 ? ` ${result.queued} I wasn't sure where to file — see Quick Calls.` : ""}`
        : result.error);
      try { await reload(); }
      catch { setOrganizeMessage((message) => `${message} Could not refresh the vault. Reload to try again.`); }
    } catch {
      setOrganizeMessage("Could not reach the organiser. Reload to check the vault.");
    } finally { setOrganising(false); }
  }
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
      <button type="button" disabled={organising} onClick={() => void organise()}
        style={{ background: "white", color: "#222", border: "1px solid #ccc", borderRadius: 6, padding: "8px 12px", marginBottom: 16, font: "inherit" }}>
        {organising ? "Organising… this can take a minute" : "Organise now"}
      </button>
      {organizeMessage && <p role="status">{organizeMessage}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 16 }}>
        {vault.folders.map((folder) => {
          const count = vault.notes.filter((note) => note.folderId === folder.id).length;
          return <Link key={folder.id} href={`/folder/${encodeURIComponent(folder.slug)}`}
            style={{ border: "1px solid #ccc", borderTop: `12px solid ${folderColor(folder)}`, color: "inherit", textDecoration: "none", padding: 20, borderRadius: 8 }}>
            <h2>{folder.name}</h2><span>{count} {count === 1 ? "note" : "notes"}</span>
          </Link>;
        })}
      </div>
      {creatingFolder ? <FolderForm onCancel={() => setCreatingFolder(false)} onSaved={(name) => {
        setCreatingFolder(false);
        setFolderMessage(`Created ${name}. New thoughts can be filed there from the next organise.`);
        void reload().catch(() => setFolderMessage(`Created ${name}. Could not refresh the vault. Reload to see it.`));
      }} /> : <button type="button" onClick={() => { setCreatingFolder(true); setFolderMessage(""); }}>+ New folder</button>}
      {folderMessage && <p role="status">{folderMessage}</p>}
      <p><Link href="/quick-calls">{quickCallsCopy(vault.openQuickCalls)}</Link>
        {todoCount > 0 && <> · <Link href="/todo">To do ({todoCount})</Link></>}</p>
    </>}
  </main>;
}

export default function Home() {
  return <TokenGate><Vault /></TokenGate>;
}
