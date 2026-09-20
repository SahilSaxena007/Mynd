"use client";

import { use } from "react";
import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import { useVault } from "@/components/vault-data";
import { folderColor } from "@/components/folder-colors";

function FolderView({ slug }: { slug: string }) {
  const { vault, error } = useVault();
  const folder = vault?.folders.find((folder) => folder.slug === slug);
  const notes = vault?.notes.filter((note) => note.folderId === folder?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return <main>
    <Link href="/" style={{ display: "inline-block", padding: "12px 0" }}>← Vault</Link>
    {error ? <p role="alert">{error}</p> : !vault ? <p role="status">Loading…</p>
      : !folder ? <h1>Folder not found</h1> : <>
        <h1 style={{ borderLeft: `8px solid ${folderColor(folder)}`, paddingLeft: 12 }}>{folder.name}</h1>
        {folder.description && <p>{folder.description}</p>}
        {!notes?.length ? <p>No notes in this folder yet.</p> : notes.map((note) => <article key={note.id}>
          <Link href={`/note/${note.id}`} style={{ display: "block", padding: "12px 0" }}>
            <h2>{note.title}</h2>{note.summary && <p>{note.summary}</p>}
          </Link>
        </article>)}
      </>}
  </main>;
}

export default function FolderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <TokenGate><FolderView key={slug} slug={slug} /></TokenGate>;
}
