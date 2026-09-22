"use client";

import { useRef, useState } from "react";
import { vaultFetch } from "./vault-data";
import type { VaultJSON } from "./vault-data";
import type { QuickCallResolution, QuickCallView, Rule } from "@/lib/db/types";

const reasons = {
  unsure: "not sure where this goes",
  added_detail: "the organiser wrote a number you never said",
  invalid_target: "it aimed at a note that doesn't exist",
  not_placed: "the organiser didn't place it",
};

export default function QuickCallCard({ call, folders, notes, filed, onFiled, onDone, onConflict, onRule }: {
  call: QuickCallView; folders: VaultJSON["folders"]; notes: VaultJSON["notes"];
  filed?: string; onFiled: (destination: string) => void; onDone: () => void;
  onConflict: () => Promise<void>; onRule: (rule: Rule) => void;
}) {
  const [elsewhere, setElsewhere] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [noteId, setNoteId] = useState("");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");

  async function resolve(resolution: QuickCallResolution, destination = "") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await vaultFetch(`/api/quick-calls/${call.id}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(resolution),
        signal: AbortSignal.timeout(15000) });
      if (response.status === 409) { await onConflict(); return; }
      if (!response.ok) throw new Error();
      if (resolution.action === "dismiss") onDone();
      else {
        setInstruction(`${call.topic} goes in ${destination}.`);
        onFiled(destination);
      }
    } catch { setError("Could not resolve this item. Your choice is still here; try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function saveRule() {
    if (pending.current) return;
    if (!instruction.trim()) { onDone(); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await vaultFetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "routing", instruction }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const { rule } = await response.json();
      if (rule) onRule(rule);
      onDone();
    } catch { setError("Could not save the rule. Your text is still here; try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  const folder = folders.find((entry) => entry.id === folderId);
  const note = notes.find((entry) => entry.id === noteId);
  function destination(resolution: QuickCallResolution) {
    if (resolution.action !== "file") return "";
    const target = "noteId" in resolution ? notes.find((entry) => entry.id === resolution.noteId) : null;
    const area = folders.find((entry) => entry.id === (target?.folderId ?? ("folderId" in resolution ? resolution.folderId : "")));
    return `${area?.name} · ${target?.title ?? ("newNoteTitle" in resolution ? resolution.newNoteTitle : "")}`;
  }
  return <article style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBlock: 16 }}>
    {filed ? <>
      <p>Filed to {filed} ✓</p>
      <label htmlFor={`rule-${call.id}`}>Rule for next time (edit, or clear to skip):</label>
      <textarea id={`rule-${call.id}`} value={instruction} disabled={busy}
        onChange={(event) => setInstruction(event.target.value)} rows={3} style={{ display: "block", width: "100%", boxSizing: "border-box" }} />
      <button disabled={busy} onClick={() => void saveRule()}>Save rule</button>{" "}
      <button disabled={busy} onClick={onDone}>Skip</button>
    </> : <>
      <p style={{ whiteSpace: "pre-wrap" }}>{call.itemText}</p>
      <p>{reasons[call.reason]}</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
        <legend>Choose where this goes</legend>
        {call.choices.map((choice, index) => <button key={index} disabled={!choice.resolution}
          onClick={() => choice.resolution && void resolve(choice.resolution, destination(choice.resolution))}>{choice.label}</button>)}
        <button aria-expanded={elsewhere} onClick={() => setElsewhere(!elsewhere)}>Somewhere else {elsewhere ? "▴" : "▾"}</button>
        {elsewhere && <>
          <label>Folder <select value={folderId} onChange={(event) => { setFolderId(event.target.value); setNoteId(""); }}>
            <option value="">Choose a folder</option>
            {folders.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>
          {folder && <>
            <label>Note <select value={noteId} onChange={(event) => setNoteId(event.target.value)}>
              <option value="">New note</option>
              {notes.filter((entry) => entry.folderId === folderId).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select></label>
            {!noteId && <label>New note title <input value={title} maxLength={1000} onChange={(event) => setTitle(event.target.value)} /></label>}
            <button disabled={!noteId && !title.trim()} onClick={() => void resolve(noteId
              ? { action: "file", noteId } : { action: "file", folderId, newNoteTitle: title },
            `${folder.name} · ${note?.title ?? title}`)}>File here</button>
          </>}
        </>}
        <button onClick={() => void resolve({ action: "dismiss" })}>Dismiss</button>
      </fieldset>
    </>}
    {busy && <p role="status">Saving…</p>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
