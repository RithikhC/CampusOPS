import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; load it with Node's require instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Keep demo recordings clean.
  devIndicators: false,
  // Lets phones on the same Wi-Fi reach the dev server (e.g. http://192.168.x.x:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
};

export default nextConfig;
