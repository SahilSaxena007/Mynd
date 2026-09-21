import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mynd",
  description: "A personal second brain.",
};

export const viewport: Viewport = { themeColor: "#8f6ac4" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", fontSize: 16 }}>
        <div style={{ padding: 16, paddingBottom: 90 }}>{children}</div>
        <nav aria-label="Main navigation" style={{ position: "fixed", bottom: 0, left: 0, right: 0,
          display: "flex", justifyContent: "space-around", background: "white", borderTop: "1px solid #ccc",
          paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Link href="/" style={{ padding: "18px 10px" }}>Vault</Link>
          <Link href="/ask" style={{ padding: "18px 10px" }}>Ask</Link>
          <Link href="/capture" style={{ padding: "18px 10px" }}>Capture</Link>
          <Link href="/captures" style={{ padding: "18px 10px" }}>Captures</Link>
        </nav>
      </body>
    </html>
  );
}
