// Serves the GitHub Pages build (./out) locally at http://localhost:4000/CampusOPS/
//   NIGHTPASS_STATIC=1 npm run build && node scripts/serve-demo.mjs
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const BASE = process.env.NIGHTPASS_BASE_PATH ?? "/CampusOPS";
const PORT = Number(process.env.PORT ?? 4000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { Location: `${BASE}/` }).end();
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname.slice(BASE.length)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) file = path.join(ROOT, "404.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Demo at http://localhost:${PORT}${BASE}/`));
