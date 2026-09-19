import { getFolderBySlug, withTransaction } from "./queries";
import { query } from "./transaction";
import type { Folder, FolderInput } from "./types";

export const JOURNAL_DESC = "Daily journal and personal reflections. GROUPING: one note per calendar day, titled by date (YYYY-MM-DD). Same-day entries append to that day's note.";
export const INBOX_DESC = "Catch-all for items the organizer could not confidently place. GROUPING: one note per item; review and re-file later.";
export const SEED_FOLDERS: FolderInput[] = [
  { name: "Mynd", slug: "mynd", color: "#8d79b8", description: "Building Mynd, the product: ideas, design thinking, decisions, plans. GROUPING: one note per idea or theme; later thoughts on the same theme append to that note." },
  { name: "Work", slug: "work", color: "#6686ac", description: "The day job: meetings, colleagues, tasks, access and tooling requests. GROUPING: one note per meeting or ongoing piece of work; follow-ups about the same meeting or person append to that note." },
  { name: "Personal", slug: "personal", color: "#7a9c73", description: "Life outside work: things to buy, errands, travel, health, films and books. GROUPING: one note per list or theme (e.g. 'things to buy', 'movies to watch'); lists use checkboxes and new items append to the existing list." },
  { name: "Journal", slug: "journal", color: "#6aa5b8", description: JOURNAL_DESC },
  { name: "Inbox", slug: "inbox", color: "#c9a86a", description: INBOX_DESC },
];

export async function seed(): Promise<Folder[]> {
  return withTransaction(async () => {
    const folders: Folder[] = [];
    for (const input of SEED_FOLDERS) {
      // Re-running the seed preserves any edits to existing folders.
      await query(`INSERT INTO folders (name, slug, description, color)
        VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
      [input.name, input.slug, input.description, input.color]);
      const folder = await getFolderBySlug(input.slug);
      if (!folder) throw new Error("Seed folder could not be read back.");
      folders.push(folder);
    }
    return folders;
  });
}
