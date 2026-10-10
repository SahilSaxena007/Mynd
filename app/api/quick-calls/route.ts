import { withAuth } from "@/lib/auth";
import { getOpenQuickCalls, getVault } from "@/lib/db/queries";
import type { QuickCallResolution } from "@/lib/db/types";

export const GET = withAuth(async () => {
  const [calls, { folders, notes }] = await Promise.all([getOpenQuickCalls(), getVault()]);
  const quickCalls = calls.map((call) => ({ ...call, choices: call.options.map((option) => {
    const folder = folders.find((folder) => folder.slug === option.folder);
    const note = notes.find((note) => note.id === option.note);
    let resolution: QuickCallResolution | null = null;
    let label = option.label;
    if (option.new_folder_name) {
      label = `${option.new_folder_name} — choose an existing folder using Somewhere else`;
    } else if (folder && note && note.folderId === folder.id) {
      label = `Add to: ${note.title} (in ${folder.name})`;
      resolution = { action: "file", noteId: note.id };
    } else if (folder && !option.note && option.new_note_title.trim()) {
      label = `New note: ${option.new_note_title} (in ${folder.name})`;
      resolution = { action: "file", folderId: folder.id, newNoteTitle: option.new_note_title };
    } else {
      label = `${label || "Suggested destination"} — unavailable; choose Somewhere else`;
    }
    return { label, resolution };
  }) }));
  return Response.json({ quickCalls, folders, notes }, { headers: { "Cache-Control": "no-store" } });
});
