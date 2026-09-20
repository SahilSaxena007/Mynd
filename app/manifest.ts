import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mynd", short_name: "Mynd", display: "standalone", start_url: "/",
    theme_color: "#8f6ac4", background_color: "#ffffff",
    icons: [192, 512].map((size) => ({ src: `/icon/${size}`, sizes: `${size}x${size}`, type: "image/png" })),
  };
}
