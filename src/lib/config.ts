/** Server configuration. Every value has a safe local default so `npm run dev` works with zero setup. */
import { createHash } from "node:crypto";
import { fromHex, publicKeyFor, toHex } from "./pass";

function devFallback(name: string, derivedFrom: string): Uint8Array {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "false") {
    throw new Error(`${name} must be set in production`);
  }
  return createHash("sha256").update(derivedFrom).digest();
}

function qrSigningKey(): Uint8Array {
  const hex = process.env.QR_SIGNING_KEY;
  if (hex) return fromHex(hex);
  return devFallback("QR_SIGNING_KEY", "nightpass-development-signing-key");
}

const signingKey = qrSigningKey();

export const config = {
  /** Ed25519 private key that mints student passes. Never leaves the server. */
  qrSigningKey: signingKey,
  /** Public half, handed to scanners so they can verify passes offline. */
  qrPublicKeyHex: toHex(publicKeyFor(signingKey)),
  /** Enables one-click demo logins and the "reset demo data" button. */
  demoMode: process.env.DEMO_MODE !== "false",
  databaseUrl: process.env.DATABASE_URL,
};
