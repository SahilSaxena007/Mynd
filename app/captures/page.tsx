"use client";

import { useEffect, useState } from "react";
import TokenGate from "@/components/TokenGate";
import { clearToken, getToken } from "@/components/token";
import type { Capture } from "@/lib/db/types";

type CaptureJSON = Omit<Capture, "capturedAt" | "createdAt" | "processedAt"> & {
  capturedAt: string; createdAt: string; processedAt: string | null;
};

function CapturesLog() {
  const [captures, setCaptures] = useState<CaptureJSON[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/captures", {
          headers: { SECRET_TOKEN: getToken() ?? "" }, cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401) {
          clearToken();
          return;
        }
        if (!response.ok) throw new Error("Could not load captures. Reload to try again.");
        const result = await response.json();
        if (!controller.signal.aborted) setCaptures(result.captures);
      } catch {
        if (!controller.signal.aborted) setError("Could not load captures. Reload to try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return (
    <section>
      <h1>Captures</h1>
      {error ? <p role="alert">{error}</p> : captures === null ? <p role="status">Loading…</p>
        : captures.length === 0 ? <p>No captures yet.</p> : captures.map((capture) => (
          <article key={capture.id} style={{ borderTop: "1px solid #ccc", padding: "16px 0" }}>
            <time dateTime={capture.capturedAt}>{new Date(capture.capturedAt).toLocaleString()}</time>
            {" "}<span><span aria-hidden="true" style={{ color: capture.status === "failed" ? "#b22" : capture.status === "processed" ? "#287a35" : "#866000" }}>●</span> {capture.status}</span>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{capture.body}</p>
          </article>
        ))}
    </section>
  );
}

export default function CapturesPage() {
  return <TokenGate><CapturesLog /></TokenGate>;
}
