import { appendToNote, createNote, insertQuickCall, linkNoteToCapture, markCaptureProcessed } from "../db/queries";
import { withTransaction } from "../db/transaction";
import { lockOrganizerTargets } from "../db/organizer-targets";
import type { RunRefs } from "./refs";
import type { ResolvedPlan } from "./coverage";

export async function applyPlan(refs: RunRefs, resolved: ResolvedPlan): Promise<ResolvedPlan> {
  return withTransaction(async () => {
    const targets = await lockOrganizerTargets([...refs.folders.values()].map((folder) => folder.id),
      [...refs.notes.values()].map((note) => note.id));
    const plan: ResolvedPlan = { newNotes: [], filed: [], queued: [...resolved.queued] };
    for (const entry of resolved.filed) {
      const existing = refs.notes.get(entry.note);
      const fresh = resolved.newNotes.find((note) => note.ref === entry.note);
      const folderId = existing?.folderId ?? (fresh && refs.folders.get(fresh.folder)?.id);
      if (folderId && targets.folders.has(folderId)
        && (!existing || targets.notes.get(existing.id) === folderId)) {
        plan.filed.push(entry);
      } else {
        plan.queued.push({ item: entry.item.ref, captureId: entry.item.captureId, topic: entry.item.topic,
          itemText: entry.item.text, reason: "invalid_target", options: [] });
      }
    }
    plan.newNotes = resolved.newNotes.filter((note) => plan.filed.some((entry) => entry.note === note.ref));
    const noteIds = new Map([...refs.notes].map(([ref, note]) => [ref, note.id]));
    for (const note of plan.newNotes) {
      const folder = refs.folders.get(note.folder);
      if (!folder) throw new Error("Resolved folder is missing.");
      const created = await createNote({ folderId: folder.id, title: note.title, summary: note.summary,
        body: plan.filed.filter((entry) => entry.note === note.ref).map((entry) => entry.markdown).join("\n\n") });
      noteIds.set(note.ref, created.id);
    }
    for (const entry of plan.filed) {
      if (refs.notes.has(entry.note)) await appendToNote(refs.notes.get(entry.note)!.id, entry.markdown);
    }
    for (const entry of plan.filed) {
      const noteId = noteIds.get(entry.note);
      if (!noteId) throw new Error("Resolved note is missing.");
      await linkNoteToCapture(noteId, entry.item.captureId);
    }
    for (const call of plan.queued) await insertQuickCall(call);
    for (const capture of refs.captures) await markCaptureProcessed(capture.id);
    return plan;
  });
}
