import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [192, 512].map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = (await id) === "512" ? 512 : 192;
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex",
    alignItems: "center", justifyContent: "center", background: "#8f6ac4", color: "white", fontSize: size * 0.65 }}>M</div>,
  { width: size, height: size });
}
