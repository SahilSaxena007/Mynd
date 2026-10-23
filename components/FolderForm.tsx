"use client";

import { useRef, useState } from "react";
import { FOLDER_PALETTE } from "./folder-colors";
import { vaultFetch, type VaultJSON } from "./vault-data";

type Folder = VaultJSON["folders"][number];
export default function FolderForm({ folder, onSaved, onCancel }: {
  folder?: Folder; onSaved: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState(folder?.color ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const fixed = folder?.slug === "journal" || folder?.slug === "inbox";

  async function save(confirmOverLimit = false) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await vaultFetch(folder ? `/api/folders/${encodeURIComponent(folder.slug)}` : "/api/folders", {
        method: folder ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, ...(color ? { color } : {}), confirmOverLimit }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) return;
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      if (result.needsConfirm) { setConfirmCount(result.count); return; }
      onSaved(result.folder.name);
    } catch { setError("Could not confirm the save. Reload to check your folders."); }
    finally { pending.current = false; setSaving(false); }
  }

  return <form onSubmit={(event) => { event.preventDefault(); void save(); }} style={{ marginBlock: 16 }}>
    <fieldset disabled={saving || confirmCount !== null} style={{ border: 0, padding: 0 }}>
      <p><label>Name <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} /></label></p>
      <p><label>What goes here? <input value={description} readOnly={fixed}
        onChange={(event) => setDescription(event.target.value)} aria-describedby="folder-description-help" /></label><br />
        <small id="folder-description-help">{fixed ? "This folder's rule is fixed." : "The organiser uses this line to decide what to file here."}</small></p>
      <fieldset><legend>Colour</legend>
        {FOLDER_PALETTE.map((value) => <label key={value} style={{ display: "inline-flex", alignItems: "center", padding: 5 }}>
          <input type="radio" name="folder-color" value={value} checked={color === value}
            onChange={() => setColor(value)} aria-label={`Colour ${value}`} />
          <span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 18, background: value }} />
        </label>)}
      </fieldset>
      <p><button type="submit">{folder ? "Save" : "Create folder"}</button>{" "}
        <button type="button" onClick={onCancel}>Cancel</button></p>
    </fieldset>
    {confirmCount !== null && <div>
      <p>You already have {confirmCount} folders. More folders can make things harder to find. Create anyway?</p>
      <button type="button" disabled={saving} onClick={() => void save(true)}>Create anyway</button>{" "}
      <button type="button" disabled={saving} onClick={() => setConfirmCount(null)}>Cancel</button>
    </div>}
    {saving && <p role="status">Saving…</p>}
    {error && <p role="alert">{error}</p>}
    {folder && <p>Changes how new thoughts are filed. Notes already here stay as they are.</p>}
  </form>;
}
