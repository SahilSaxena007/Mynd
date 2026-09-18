"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import TokenGate from "@/components/TokenGate";
import { clearDraft, setDraft, useDraft } from "@/components/draft";
import { clearToken, getToken } from "@/components/token";

export default function CapturePage() {
  // The draft is external state, so it survives reloads and re-unlocking after a 401.
  const body = useDraft();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !body.trim()) return;
    inFlight.current = true;
    setSending(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", SECRET_TOKEN: getToken() ?? "" },
        body: JSON.stringify({ body, device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "phone" : "laptop" }),
      });
      if (response.status === 401) {
        clearToken();
        throw new Error("Unlock again to send. Your text is still here.");
      }
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Could not send. Try again.");
      }
      // Cleared only here, on a confirmed write. Every failure path leaves the
      // stored draft untouched (CAP2).
      clearDraft();
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send. Try again.");
    } finally {
      inFlight.current = false;
      setSending(false);
      textarea.current?.focus();
    }
  }

  return (
    <TokenGate>
      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12, height: "calc(100dvh - 110px)" }}>
        <textarea ref={textarea} aria-label="Capture a thought" autoFocus value={body}
          readOnly={sending} onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, minHeight: 160, resize: "none", padding: 16, font: "inherit" }} />
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Saved.</p>}
        <button disabled={!body.trim() || sending} style={{ minHeight: 48 }}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </TokenGate>
  );
}
