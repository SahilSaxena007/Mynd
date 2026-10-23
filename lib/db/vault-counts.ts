import { query } from "./transaction";

export async function vaultCounts() {
  // One statement gives the totals and folder breakdown the same snapshot.
  return (await query<{ counts: Record<string, number>; folders: { slug: string; name: string; notes: number }[] }>(`
    SELECT json_build_object(
      'folders', (SELECT count(*) FROM folders), 'notes', (SELECT count(*) FROM notes),
      'captures', (SELECT count(*) FROM captures), 'quick_calls', (SELECT count(*) FROM quick_calls),
      'rules', (SELECT count(*) FROM rules), 'asks', (SELECT count(*) FROM asks)) AS counts,
      COALESCE((SELECT json_agg(f ORDER BY f.slug) FROM (
        SELECT folders.slug, folders.name, count(notes.id)::int AS notes FROM folders
        LEFT JOIN notes ON notes.folder_id = folders.id GROUP BY folders.id
      ) f), '[]'::json) AS folders
  `)).rows[0];
}
