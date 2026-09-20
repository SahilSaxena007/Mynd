"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import NoteBody, { toggleTaskLine } from "@/components/NoteBody";
import { useVault, vaultFetch, type NoteJSON } from "@/components/vault-data";

function NoteView({ id }: { id: string }) {
  const { vault, error: vaultError } = useVault();
  const [note, setNote] = useState<NoteJSON | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<NoteJSON | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await vaultFetch(`/api/note/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? "Note not found." : "Could not load the note. Reload to try again.");
        const result = await response.json();
        if (!controller.signal.aborted) setNote(result.note);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the note.");
      }
    }
    void load();
    return () => controller.abort();
  }, [id]);

  async function save(body: string) {
    if (!note || inFlight.current || conflict || !body.trim() || body === note.body) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await vaultFetch(`/api/note/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, updatedAt: note.updatedAt }), signal: AbortSignal.timeout(15000),
      });
      if (response.status === 409) {
        const result = await response.json();
        setConflict(result.note);
        setError("This note changed. Your changes were not saved. The current note is shown below.");
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      setNote(result.note);
      setEditing(false);
    } catch {
      setError("Could not confirm the save. Your text is unchanged here. Retry or reload to check the saved note.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const folder = vault?.folders.find((folder) => folder.id === note?.folderId);
  return <main>
    <Link href={folder ? `/folder/${encodeURIComponent(folder.slug)}` : "/"}
      style={{ display: "inline-block", padding: "12px 0" }}>← {folder?.name ?? "Vault"}</Link>
    {vaultError && <p role="alert">{vaultError}</p>}
    {error && <p role="alert">{error}</p>}
    {!note ? !error && <p role="status">Loading…</p> : <>
      <h1>{note.title}</h1>
      {editing ? <>
        <label htmlFor="note-body">{conflict ? "Your unsaved Markdown" : "Markdown"}</label>
        <textarea id="note-body" value={draft} readOnly={saving || !!conflict}
          onChange={(event) => setDraft(event.target.value)}
          style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 320, fontSize: 16, padding: 12 }} />
        <button onClick={() => void save(draft)} disabled={saving || !!conflict || !draft.trim() || draft === note.body || draft.length > 200_000}
          style={{ minHeight: 48, marginRight: 12 }}>Save</button>
        <button onClick={() => { setEditing(false); setDraft(""); }} disabled={saving} style={{ minHeight: 48 }}>Cancel</button>
        {draft.length > 200_000 && <p role="alert">Body must be at most 200,000 characters.</p>}
      </> : !conflict && <>
        <button disabled={saving} onClick={() => { setDraft(note.body); setEditing(true); setError(""); }} style={{ minHeight: 48 }}>Edit</button>
        <NoteBody body={note.body} disabled={saving} onToggle={(line) => void save(toggleTaskLine(note.body, line))} />
      </>}
      {saving && <p role="status">Saving…</p>}
      {conflict && <section>
        <h2>Current saved note</h2>
        <NoteBody body={conflict.body} disabled />
        <button style={{ minHeight: 48 }} onClick={() => {
          setNote(conflict); setConflict(null); setEditing(false); setDraft(""); setError("");
        }}>Use current note{editing ? " and discard draft" : ""}</button>
      </section>}
    </>}
  </main>;
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TokenGate><NoteView key={id} id={id} /></TokenGate>;
}
