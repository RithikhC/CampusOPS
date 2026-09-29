// Builds the browser-only demo for GitHub Pages into ./out
//   npm run build:pages            (served at /CampusOPS)
//   NIGHTPASS_BASE_PATH=/my-repo npm run build:pages
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, NIGHTPASS_STATIC: "1" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// GitHub Pages runs Jekyll by default, which skips folders starting with "_" (like _next).
writeFileSync("out/.nojekyll", "");
console.log("Static demo ready in ./out");
