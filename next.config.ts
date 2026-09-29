import type { NextConfig } from "next";

/**
 * NIGHTPASS_STATIC=1 builds the browser-only demo for GitHub Pages: a static export that only
 * picks up files ending in .demo.tsx, and answers API calls in the browser (src/demo).
 */
const staticDemo = process.env.NIGHTPASS_STATIC === "1";
const basePath = staticDemo ? (process.env.NIGHTPASS_BASE_PATH ?? "/CampusOPS") : "";

const nextConfig: NextConfig = staticDemo
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      pageExtensions: ["demo.tsx"],
      images: { unoptimized: true },
      env: { NEXT_PUBLIC_BASE_PATH: basePath },
      devIndicators: false,
    }
  : {
      // PGlite ships a WASM build of Postgres; load it with Node's require instead of bundling it.
      serverExternalPackages: ["@electric-sql/pglite", "pg"],
      // Keep demo recordings clean.
      devIndicators: false,
      // Lets phones on the same Wi-Fi reach the dev server (e.g. http://192.168.x.x:3000).
      allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
    };

export default nextConfig;
