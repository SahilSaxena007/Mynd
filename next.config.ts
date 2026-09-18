import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: Next 16 requires non-localhost origins to be named explicitly
  // before it will serve its dev/HMR client to them. Needed to open the app
  // from a phone on the same Wi-Fi. Has no effect on a production build.
  allowedDevOrigins: ["192.168.1.219", "localhost", "127.0.0.1"],
};

export default nextConfig;
