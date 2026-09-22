"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TokenGate from "@/components/TokenGate";
import QuickCallCard from "@/components/QuickCallCard";
import { vaultFetch, type VaultJSON } from "@/components/vault-data";
import type { QuickCallView, Rule } from "@/lib/db/types";

type Row = { call: QuickCallView; filed?: string };
type Queue = { quickCalls: QuickCallView[]; folders: VaultJSON["folders"]; notes: VaultJSON["notes"] };

function QuickCalls() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [turningOff, setTurningOff] = useState<string | null>(null);
  const switching = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const [callsResponse, rulesResponse] = await Promise.all([
      vaultFetch("/api/quick-calls", { signal }), vaultFetch("/api/rules", { signal }),
    ]);
    if (!callsResponse.ok || !rulesResponse.ok) throw new Error();
    const [next, taught]: [Queue, { rules: Rule[] }] = await Promise.all([callsResponse.json(), rulesResponse.json()]);
    if (signal?.aborted) return;
    setQueue(next);
    // Keep unsaved rule steps in place while refreshing other devices' decisions.
    setRows((current) => {
      const open = new Map(next.quickCalls.map((call) => [call.id, call]));
      const kept = current.flatMap((row) => row.filed ? [row] : open.has(row.call.id) ? [{ call: open.get(row.call.id)! }] : []);
      const known = new Set(kept.map((row) => row.call.id));
      return [...kept, ...next.quickCalls.filter((call) => !known.has(call.id)).map((call) => ({ call }))];
    });
    setRules(taught.rules);
    setError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function initialLoad() {
      try { await load(controller.signal); }
      catch {
        if (!controller.signal.aborted) setError("Could not load Quick Calls. Reload to try again.");
      }
    }
    void initialLoad();
    return () => controller.abort();
  }, [load]);

  async function conflict() {
    setNotice("This item was already handled on another device.");
    try { await load(AbortSignal.timeout(15000)); }
    catch { setError("Could not refresh the list. Reload to see the latest decisions."); }
  }

  async function refreshDestinations() {
    try {
      const response = await vaultFetch("/api/quick-calls", { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const next: Queue = await response.json();
      // Refresh new notes without overwriting rule saves or other in-flight cards.
      setQueue(next);
    } catch { setError("Filed successfully, but destinations could not refresh. Reload to update them."); }
  }

  async function turnOff(id: string) {
    if (switching.current) return;
    switching.current = true;
    setTurningOff(id);
    setError("");
    try {
      const response = await vaultFetch("/api/rules", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: false }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch { setError("Could not turn off the rule. Try again."); }
    finally { switching.current = false; setTurningOff(null); }
  }

  return <main>
    <Link href="/">← Vault</Link>
    <h1>Quick Calls</h1>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!queue ? <p role="status">Loading…</p> : <>
      <p>{rows.filter((row) => !row.filed).length} need a decision</p>
      {!rows.length && <p>All caught up.</p>}
      {rows.map((row) => <QuickCallCard key={row.call.id} call={row.call} filed={row.filed}
        folders={queue.folders} notes={queue.notes}
        onFiled={(filed) => {
          setRows((current) => current.map((entry) => entry.call.id === row.call.id ? { ...entry, filed } : entry));
          void refreshDestinations();
        }}
        onDone={() => setRows((current) => current.filter((entry) => entry.call.id !== row.call.id))}
        onConflict={conflict} onRule={(rule) => setRules((current) => [...current, rule])} />)}
      <h2>Rules you&apos;ve taught it</h2>
      {!rules.length && <p>No active rules yet.</p>}
      {rules.map((rule) => <div key={rule.id} style={{ marginBlock: 16 }}>
        <p style={{ whiteSpace: "pre-wrap" }}>{rule.instruction}</p>
        <button disabled={turningOff !== null} onClick={() => void turnOff(rule.id)}>
          {turningOff === rule.id ? "Turning off…" : "Turn off"}
        </button>
      </div>)}
    </>}
  </main>;
}

export default function Page() { return <TokenGate><QuickCalls /></TokenGate>; }
