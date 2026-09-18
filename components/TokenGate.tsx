"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { setToken, useToken } from "./token";

export default function TokenGate({ children }: { children: ReactNode }) {
  const token = useToken();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  if (token) return children;

  // Verify before storing: a presence-only gate lets a typo look like success
  // until the first send fails with a 401.
  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (checking || !input) return;
    setChecking(true);
    setError("");
    try {
      // Timed out rather than left hanging: without this a request that never
      // settles leaves the form readOnly and the button stuck on "Checking…".
      const response = await fetch("/api/captures", {
        headers: { SECRET_TOKEN: input },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401) {
        setError("That token isn't right.");
        return;
      }
      if (!response.ok) {
        // An unreachable or broken server must never be reported as a bad token.
        setError("Can't reach the server. Try again.");
        return;
      }
      if (!setToken(input)) {
        setError("Site storage is unavailable. Enable it to unlock.");
        return;
      }
      setInput("");
    } catch {
      setError("Can't reach the server. Try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={unlock} style={{ display: "grid", gap: 16, padding: 16 }}>
      <label htmlFor="token">Secret token</label>
      {/* autoComplete off: a password field here invites the browser's own
          suggestion dropdown, which renders directly over the button below. */}
      <input id="token" type="password" autoComplete="off" autoFocus value={input}
        onChange={(e) => setInput(e.target.value)} style={{ fontSize: 16, padding: 12 }} />
      <button disabled={!input.trim() || checking} style={{ minHeight: 48 }}>
        {checking ? "Checking…" : "Unlock"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
