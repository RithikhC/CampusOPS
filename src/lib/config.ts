/**
 * App configuration. Every value has a safe default so `npm run dev` works with no setup.
 * No Node-only imports, so the browser demo (GitHub Pages) can use the same code.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { fromHex, publicKeyFor, toHex } from "./pass";

function devFallback(name: string, derivedFrom: string): Uint8Array {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "false") {
    throw new Error(`${name} must be set in production`);
  }
  return sha256(new TextEncoder().encode(derivedFrom));
}

function qrSigningKey(): Uint8Array {
  const hex = process.env.QR_SIGNING_KEY;
  if (hex) return fromHex(hex);
  return devFallback("QR_SIGNING_KEY", "nightpass-development-signing-key");
}

const signingKey = qrSigningKey();

export const config = {
  /** Ed25519 private key that creates student passes. Never sent to scanners. */
  qrSigningKey: signingKey,
  /** Public half, given to scanners so they can check passes offline. */
  qrPublicKeyHex: toHex(publicKeyFor(signingKey)),
  /** Enables one-click demo logins and the "reset demo data" button. */
  demoMode: process.env.DEMO_MODE !== "false",
  databaseUrl: process.env.DATABASE_URL,
};
