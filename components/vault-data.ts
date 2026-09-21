"use client";

import { useEffect, useState } from "react";
import { clearToken, getToken } from "./token";
import type { Folder, Note, OrganizeRun } from "@/lib/db/types";

export type NoteJSON = Omit<Note, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
export type VaultJSON = {
  folders: (Omit<Folder, "createdAt"> & { createdAt: string })[];
  notes: Omit<NoteJSON, "body">[];
  openQuickCalls: number;
  lastRun: (Omit<OrganizeRun, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string }) | null;
};

export async function vaultFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, cache: "no-store",
    headers: { ...options.headers, SECRET_TOKEN: getToken() ?? "" } });
  if (response.status === 401) clearToken();
  return response;
}

export function useVault() {
  const [vault, setVault] = useState<VaultJSON | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await vaultFetch("/api/vault", { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result: VaultJSON = await response.json();
        if (!controller.signal.aborted) setVault(result);
      } catch {
        if (!controller.signal.aborted) setError("Could not load the vault. Reload to try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return { vault, error };
}
