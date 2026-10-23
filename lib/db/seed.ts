import { readFile } from "node:fs/promises";
import { getFolderBySlug, listFolders, withTransaction } from "./queries";
import { query } from "./transaction";
import type { Folder, FolderInput } from "./types";

export const DEFAULT_GROUPING = "GROUPING: One note per topic; new items on the same topic append to that note.";

export const JOURNAL_DESC = "Daily journal and personal reflections. GROUPING: one note per calendar day, titled by date (YYYY-MM-DD). Same-day entries append to that day's note.";
export const INBOX_DESC = "Catch-all for items the organizer could not confidently place. GROUPING: one note per item; review and re-file later.";
export const SEED_FOLDERS: FolderInput[] = [
  { name: "Tasks", slug: "tasks", color: "#b89068", description: "Things the user has to do: calls, errands, appointments to book, emails, follow-ups — including future tasks. GROUPING: one checklist note per area of life — 'personal to-dos', 'work to-dos', 'mynd to-dos'. Each task is a checkbox - [ ] …. Keep any timing exactly as said ('next week', 'on the 12th'); never turn it into a date. Shopping lists are not tasks; they belong in Personal." },
  { name: "Mynd", slug: "mynd", color: "#8d79b8", description: "Building Mynd, the product: ideas, design thinking, decisions, plans. GROUPING: one note per idea or theme; later thoughts on the same theme append to that note." },
  { name: "Work", slug: "work", color: "#6686ac", description: "The day job: meetings, colleagues, tasks, access and tooling requests. GROUPING: one note per meeting or ongoing piece of work; follow-ups about the same meeting or person append to that note." },
  { name: "Personal", slug: "personal", color: "#7a9c73", description: "Life outside work: things to buy, errands, travel, health, films and books. GROUPING: one note per list or theme (e.g. 'things to buy', 'movies to watch'); lists use checkboxes and new items append to the existing list." },
  { name: "Learning", slug: "learning", color: "#a07a9c", description: "Notes from podcasts, books, courses, videos, articles and technical explainers. GROUPING: one note per source, titled by the source (e.g. 'Andrew Huberman podcast', 'Throttling'); each chapter, episode or subtopic is a ## section using the user's own heading; later notes on the same source join that note." },
  { name: "Journal", slug: "journal", color: "#6aa5b8", description: JOURNAL_DESC },
  { name: "Inbox", slug: "inbox", color: "#c9a86a", description: INBOX_DESC },
];

export async function loadSeedFolders(file = process.env.SEED_FOLDERS_FILE): Promise<FolderInput[]> {
  if (file === undefined) return SEED_FOLDERS;
  const inputs: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(inputs)) throw new Error("Seed folders must be an array.");
  const slugs = new Set<string>();
  const folders = inputs.map((input): FolderInput => {
    if (!input || typeof input !== "object"
      || ["name", "slug", "color", "description"].some((key) =>
        typeof input[key] !== "string" || !input[key].trim())
      || !/^[a-z0-9-]+$/.test(input.slug) || !/^#[0-9a-f]{6}$/i.test(input.color)
      || slugs.has(input.slug)) throw new Error("Invalid seed folder fields or duplicate slug.");
    slugs.add(input.slug);
    return { name: input.name, slug: input.slug, color: input.color, description: input.description };
  });
  return [...folders, ...SEED_FOLDERS.filter((folder) =>
    (folder.slug === "inbox" || folder.slug === "journal") && !slugs.has(folder.slug))];
}

export async function seed(): Promise<Folder[]> {
  return (await seedWithResult()).folders;
}

export async function seedWithResult(): Promise<{ folders: Folder[]; skipped: boolean }> {
  return withTransaction(async () => {
    await query("SELECT pg_advisory_xact_lock(715001)");
    // Coordinate with user folder creation too: an empty vault must stay empty
    // between the check and insertion of the initial set.
    await query("SELECT pg_advisory_xact_lock(715004)");
    const count = Number((await query<{ count: string }>("SELECT count(*) FROM folders")).rows[0].count);
    if (count > 0) return { folders: await listFolders(), skipped: true };
    const inputs = await loadSeedFolders();
    const folders: Folder[] = [];
    for (const input of inputs) {
      // Re-running the seed preserves any edits to existing folders.
      await query(`INSERT INTO folders (name, slug, description, color)
        VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
      [input.name, input.slug, input.description, input.color]);
      const folder = await getFolderBySlug(input.slug);
      if (!folder) throw new Error("Seed folder could not be read back.");
      folders.push(folder);
    }
    return { folders, skipped: false };
  });
}
