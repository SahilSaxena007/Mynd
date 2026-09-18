import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vault",
  description: "A personal second brain.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", fontSize: 16 }}>
        <div style={{ padding: 16, paddingBottom: 90 }}>{children}</div>
        <nav aria-label="Main navigation" style={{ position: "fixed", bottom: 0, left: 0, right: 0,
          display: "flex", justifyContent: "space-around", background: "white", borderTop: "1px solid #ccc",
          paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Link href="/" style={{ padding: 18 }}>Vault</Link>
          <Link href="/capture" style={{ padding: 18 }}>Capture</Link>
          <Link href="/captures" style={{ padding: 18 }}>Captures</Link>
        </nav>
      </body>
    </html>
  );
}
