"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import TokenGate from "@/components/TokenGate";
import { vaultFetch } from "@/components/vault-data";
import type { Ask } from "@/lib/db/types";

type AskJSON = Omit<Ask, "createdAt"> & { createdAt: string };

function relativeTime(date: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  return formatter.format(-Math.floor(seconds / 86400), "day");
}

function AskScreen({ question, setQuestion }: { question: string; setQuestion: (value: string) => void }) {
  const [asks, setAsks] = useState<AskJSON[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unanswered, setUnanswered] = useState(false);
  const submitting = useRef(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    async function load() {
      try {
        const response = await vaultFetch("/api/asks", { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          // Keep any question submitted while history was loading.
          setAsks((current) => [...(current ?? []), ...result.asks.filter((ask: AskJSON) =>
            !current?.some((saved) => saved.id === ask.id))].slice(0, 25));
          setLabels((current) => ({ ...result.labels, ...current }));
          setNow(Date.now());
        }
      } catch {
        if (!controller.signal.aborted) setHistoryError("Could not load history. Reload to try again.");
      }
    }
    void load();
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !question.trim()) return;
    submitting.current = true;
    setSending(true);
    setError("");
    setUnanswered(false);
    try {
      const response = await vaultFetch("/api/ask", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.ask.answered) {
        setAsks((current) => [result.ask, ...(current ?? [])].slice(0, 25));
        setLabels((current) => ({ ...current, ...result.labels }));
        setExpandedId(result.ask.id);
      } else {
        setUnanswered(true);
      }
      setNow(Date.now());
      setQuestion("");
    } catch {
      setError("Could not answer your question. Your question is still here; try again.");
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  return <section style={{ maxWidth: 720, margin: "0 auto" }}>
    <h1>Ask</h1>
    <form onSubmit={submit}>
      <label htmlFor="question">Ask your notes a question</label>
      <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)}
        disabled={sending} maxLength={100_000} rows={3} required
        style={{ display: "block", width: "100%", boxSizing: "border-box", font: "inherit", margin: "12px 0" }} />
      <button disabled={sending || !question.trim()} type="submit">{sending ? "Asking…" : "Ask"}</button>
      {error && <p role="alert">{error}</p>}
      {unanswered && <div role="status">
        <p>Not in your notes.</p>
        <p>Nothing in your vault answers that.</p>
      </div>}
    </form>
    <h2>Recent questions</h2>
    {historyError && <p role="alert">{historyError}</p>}
    {asks === null ? !historyError && <p role="status">Loading…</p>
      : asks.length === 0 ? <p>No questions yet.</p> : asks.map((ask) => <article key={ask.id}
        style={{ borderTop: "1px solid #ccc", padding: "16px 0", overflowWrap: "anywhere" }}>
        <button type="button" aria-expanded={expandedId === ask.id}
          onClick={() => setExpandedId((current) => current === ask.id ? null : ask.id)}
          style={{ cursor: "pointer", display: "block", width: "100%", padding: 0,
            border: 0, background: "none", color: "inherit", font: "inherit", textAlign: "left",
            overflowWrap: "anywhere" }}>
          <strong>{ask.question}</strong>
          <span style={{ whiteSpace: "pre-wrap", margin: "16px 0",
            display: expandedId === ask.id ? "block" : "-webkit-box",
            WebkitBoxOrient: "vertical", WebkitLineClamp: expandedId === ask.id ? undefined : 2,
            overflow: expandedId === ask.id ? "visible" : "hidden" }}>{ask.answer}</span>
          <time dateTime={ask.createdAt}>{relativeTime(ask.createdAt, now)}</time>
        </button>
        {expandedId === ask.id && <>
          {ask.citations.map((citation) => <p key={citation.ref}>
          {citation.kind === "note"
            ? <Link href={`/note/${citation.id}`}>{labels[citation.id] ?? citation.ref}</Link>
            : <span style={{ whiteSpace: "pre-wrap" }}><em>not yet filed</em>: {labels[citation.id] ?? citation.ref}</span>}
          </p>)}
          <small>Cost: ${ask.costUsd.toFixed(6)}</small>
        </>}
      </article>)}
  </section>;
}

export default function AskPage() {
  // Keep the question above the gate so a 401/unlock cycle cannot discard it.
  const [question, setQuestion] = useState("");
  return <TokenGate><AskScreen question={question} setQuestion={setQuestion} /></TokenGate>;
}
