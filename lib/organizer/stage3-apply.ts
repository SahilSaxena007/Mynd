import { appendToNote, createNote, insertQuickCall, linkNoteToCapture, markCaptureProcessed } from "../db/queries";
import { withTransaction } from "../db/transaction";
import { lockOrganizerCaptures, lockOrganizerTargets } from "../db/organizer-targets";
import { isDeepStrictEqual } from "node:util";
import type { RunRefs } from "./refs";
import type { ResolvedPlan } from "./coverage";

export function assertResolvedPlan(refs: RunRefs, plan: ResolvedPlan): void {
  const fail = () => { throw new Error("Invalid saved plan: coverage or references do not match."); };
  const captures = new Map(refs.captures.map((capture) => [capture.id, capture]));
  const items = new Map(refs.items.map((item) => [item.ref, item]));
  const newNotes = new Map(plan.newNotes.map((note) => [note.ref, note]));
  if (!captures.size || captures.size !== refs.captures.length || items.size !== refs.items.length
    || newNotes.size !== plan.newNotes.length) fail();
  for (const [index, item] of refs.items.entries()) {
    const capture = captures.get(item.captureId);
    if (item.ref !== `I${index + 1}` || !capture || item.text !== item.quotes.join("\n")
      || item.quotes.some((quote) => !capture.body.includes(quote))) fail();
  }
  for (const note of plan.newNotes) {
    if (!refs.newNoteRefs.has(note.ref) || refs.notes.has(note.ref) || !refs.folders.has(note.folder)
      || !plan.filed.some((entry) => entry.note === note.ref)) fail();
  }
  const accounted = new Set<string>();
  for (const entry of plan.filed) {
    if (!isDeepStrictEqual(items.get(entry.item.ref), entry.item) || accounted.has(entry.item.ref)
      || !entry.markdown.trim() || (!refs.notes.has(entry.note) && !newNotes.has(entry.note))) fail();
    accounted.add(entry.item.ref);
  }
  for (const call of plan.queued) {
    const item = items.get(call.item);
    if (!item || accounted.has(call.item) || call.captureId !== item.captureId
      || call.topic !== item.topic || call.itemText !== item.text || call.options.length > 3) fail();
    for (const option of call.options) {
      const note = [...refs.notes.values()].find((note) => note.id === option.note);
      if ((option.folder && !refs.folders.has(option.folder)) || (option.note && !note)
        || (note && option.folder && note.folderId !== refs.folders.get(option.folder)?.id)
        || (option.new_folder_name ? !!option.folder || !!option.note : !option.folder)) fail();
    }
    accounted.add(call.item);
  }
  if (plan.filed.length + plan.queued.length !== refs.items.length || accounted.size !== items.size) fail();
}

export async function applyPlan(refs: RunRefs, resolved: ResolvedPlan, exact = false): Promise<ResolvedPlan> {
  assertResolvedPlan(refs, resolved);
  return withTransaction(async () => {
    await lockOrganizerCaptures(refs.captures);
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
        if (exact) throw new Error("Saved plan target is missing or changed; nothing was written.");
        plan.queued.push({ item: entry.item.ref, captureId: entry.item.captureId, topic: entry.item.topic,
          itemText: entry.item.text, reason: "invalid_target", options: [] });
      }
    }
    plan.newNotes = resolved.newNotes.filter((note) => plan.filed.some((entry) => entry.note === note.ref));
    if (exact) {
      for (const call of plan.queued) for (const option of call.options) {
        const folder = option.folder && refs.folders.get(option.folder);
        if ((folder && !targets.folders.has(folder.id))
          || (option.note && (!targets.notes.has(option.note)
            || (folder && targets.notes.get(option.note) !== folder.id)))) {
          throw new Error("Saved plan option target is missing or changed; nothing was written.");
        }
      }
    }
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
