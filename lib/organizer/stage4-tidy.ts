import { getEditableNotes, listFolders, type EditableNote } from "../db/queries";
import { applyTidy } from "../db/tidy";
import { complete } from "../model";
import { tidyPrompt } from "../prompts/tidy";
import { runError } from "./run-record";
import { tidyGuard, type TidyOperation } from "./tidy-guards";
import { tidySchema, validateTidy, type TidyPlan } from "./tidy-types";

export type TidyResult = { notesTidied: number; notesMerged: number; tidyRejected: number;
  error: string | null; operations: { operation: TidyOperation; errors: string[] }[] };
export type TidyOptions = { touched?: string[]; all?: boolean; folder?: string; dry?: boolean; details?: boolean };
const dependencies = {
  getEditableNotes, listFolders, applyTidy,
  propose: async (user: string) => (await complete<TidyPlan>({ job: "route", system: tidyPrompt,
    user, schema: tidySchema, maxTokens: 16_000 })).data,
};

export async function tidyNotes(options: TidyOptions, deps = dependencies): Promise<TidyResult> {
  const result: TidyResult = { notesTidied: 0, notesMerged: 0, tidyRejected: 0, error: null, operations: [] };
  try {
    const cap = Number(process.env.TIDY_MAX_NOTES ?? 8);
    if (!Number.isSafeInteger(cap) || cap < 1) throw new Error("Invalid TIDY_MAX_NOTES");
    const folders = await deps.listFolders();
    if (options.folder && !folders.some((folder) => folder.slug === options.folder)) throw new Error("Unknown tidy folder");
    const notes = await deps.getEditableNotes();
    let remaining = cap;
    for (const folder of folders) {
      if (folder.slug === "journal" || (options.folder && options.folder !== folder.slug)) continue;
      const members = notes.filter((note) => note.folderId === folder.id && !note.archivedAt)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
      const fullPass = options.all || !!options.folder;
      const touched = members.filter((note) => options.touched?.includes(note.id));
      if (!fullPass && !touched.length) continue;
      const limit = fullPass ? cap : remaining;
      if (limit <= 0) break;
      const selected = (fullPass ? members : [...touched, ...members.filter((note) => !touched.includes(note))]).slice(0, limit);
      if (!selected.length) continue;
      if (!fullPass) remaining -= selected.length;
      const refs = new Map(members.map((note, index) => [`N${index + 1}`, note]));
      const eligible = new Set(selected.map((note) => note.id));
      const plan = await deps.propose(JSON.stringify({ folder: { name: folder.name, description: folder.description },
        notes: [...refs].map(([ref, note]) => ({ ref, title: note.title, summary: note.summary,
          ...(eligible.has(note.id) ? { body: note.body } : {}) })) }));
      if (!validateTidy(plan)) throw new Error("Invalid tidy plan");
      const used = new Set<string>();
      for (const operation of plan.operations) {
        const involved = [operation.note, ...operation.absorbs];
        const old = involved.map((ref) => refs.get(ref));
        let errors: string[] = [];
        if (new Set(involved).size !== involved.length || involved.some((ref) => used.has(ref))
          || old.some((note) => !note || !eligible.has(note.id))
          || (!fullPass && !old.some((note) => note && touched.includes(note)))) errors = ["references or scope"];
        else errors = tidyGuard(old as EditableNote[], operation);
        if (!errors.length) {
          involved.forEach((ref) => used.add(ref));
          if (!options.dry) {
            try {
              errors = await deps.applyTidy({ ...operation,
                note: old[0]!.id, absorbs: old.slice(1).map((note) => note!.id) }, old as EditableNote[]);
            } catch { errors = ["G4 transaction failed (rolled back)"]; }
          }
        }
        result.operations.push({ operation, errors });
        if (errors.length) result.tidyRejected++;
        else { result.notesTidied++; result.notesMerged += operation.absorbs.length; }
        if (options.details !== false) console.log(`TIDY [${folder.slug}] ${JSON.stringify(operation)}\n  ${errors.length ? errors.join(", ") : options.dry ? "PASS (dry)" : "APPLIED"}`);
      }
    }
  } catch (error) {
    // Filing has already committed. No retry, including budget refusals.
    result.error = runError("tidy", error);
    result.tidyRejected++;
    console.error(result.error);
  }
  return result;
}
