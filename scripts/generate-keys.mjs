// Prints fresh secrets for .env.local / your host's environment variables.
//   node scripts/generate-keys.mjs
import { randomBytes } from "node:crypto";

console.log(`QR_SIGNING_KEY=${randomBytes(32).toString("hex")}`);
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
