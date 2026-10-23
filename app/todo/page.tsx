"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import NoteBody from "@/components/NoteBody";
import { useVault, vaultFetch, type NoteJSON } from "@/components/vault-data";
import { extractTodoTasks, extractDoneTasks, toggleTaskLine } from "@/lib/note-tasks";

function Todo() {
  const { vault, error, reload, setVault } = useVault();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const pending = useRef(false);

  async function tick(note: NoteJSON, line: number) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    try {
      const response = await vaultFetch(`/api/note/${encodeURIComponent(note.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: toggleTaskLine(note.body, line), updatedAt: note.updatedAt }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 409) {
        await reload();
        setMessage("This note changed; refreshed.");
        return;
      }
      if (!response.ok) throw new Error();
      const result: { note: NoteJSON } = await response.json();
      setVault((current) => current && { ...current,
        notes: current.notes.map((entry) => entry.id === note.id ? result.note : entry) });
    } catch {
      setMessage("Could not confirm the save. Reload to check the saved note, or try again.");
    } finally { pending.current = false; setSaving(false); }
  }

  const groups = vault?.folders.flatMap((folder) => vault.notes
    .filter((note) => note.folderId === folder.id)
    .map((note) => ({ folder, note, tasks: extractTodoTasks(note.body) }))
    .filter(({ tasks }) => tasks.length)) ?? [];
  const completed = vault?.folders.flatMap((folder) => vault.notes
    .filter((note) => note.folderId === folder.id)
    .map((note) => ({ folder, note, tasks: extractDoneTasks(note.body) }))
    .filter(({ tasks }) => tasks.length)) ?? [];
  const completedCount = completed.reduce((count, group) => count + group.tasks.length, 0);

  return <main style={{ maxWidth: 680, margin: "0 auto" }}>
    <Link href="/">← Vault</Link>
    <h1>To do</h1>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {saving && <p role="status">Saving…</p>}
    {!vault ? !error && <p role="status">Loading…</p> : groups.length === 0 ? <p>No tasks to do.</p> :
      groups.map(({ folder, note, tasks }) => <section key={note.id}>
        <h2><Link href={`/note/${encodeURIComponent(note.id)}`}>{note.title}</Link></h2>
        <p>{folder.name}</p>
        {tasks.map(({ line }) => <NoteBody key={line} body={note.body} taskLine={line}
          disabled={saving} onToggle={(sourceLine) => void tick(note, sourceLine)} />)}
      </section>)}
    {vault && <>
      <button type="button" onClick={() => setShowCompleted((shown) => !shown)} aria-expanded={showCompleted}>
        {showCompleted ? "Hide completed" : `Show completed (${completedCount})`}
      </button>
      {showCompleted && completed.map(({ folder, note, tasks }) => <section key={note.id}>
        <h2><Link href={`/note/${encodeURIComponent(note.id)}`}>{note.title}</Link></h2>
        <p>{folder.name}</p>
        {tasks.map(({ line }) => <NoteBody key={line} body={note.body} taskLine={line}
          disabled={saving} onToggle={(sourceLine) => void tick(note, sourceLine)} />)}
      </section>)}
    </>}
  </main>;
}

export default function TodoPage() { return <TokenGate><Todo /></TokenGate>; }
