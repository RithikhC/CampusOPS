/**
 * NightPass codes. Shared by the server (signing) and the guard's phone (offline verification).
 *
 * A code looks like:  NP1.<studentId>.<period base36>.<ed25519 signature, base64url>
 *
 * The period changes every PERIOD_SECONDS, so the QR on a student's phone rotates and a
 * screenshot forwarded to a friend stops working within seconds. Codes are signed with the
 * university's private key; scanners only hold the public key, so they can verify offline
 * but can never mint a code.
 */
import { ed25519 } from "@noble/curves/ed25519.js";

export const PASS_PREFIX = "NP1";
export const PERIOD_SECONDS = 15;
/** How many periods old a code may be and still be accepted (covers scan + network jitter). */
export const MAX_AGE_PERIODS = 2;
/** Tolerates a student phone whose clock runs slightly ahead of the scanner's. */
export const FUTURE_TOLERANCE_PERIODS = 1;

const STUDENT_ID = /^[A-Z0-9]{4,20}$/;

export function periodAt(ms: number): number {
  return Math.floor(ms / 1000 / PERIOD_SECONDS);
}

export function periodStartMs(period: number): number {
  return period * PERIOD_SECONDS * 1000;
}

function passMessage(studentId: string, period: number): string {
  return `${PASS_PREFIX}.${studentId}.${period.toString(36)}`;
}

export function signPass(studentId: string, period: number, secretKey: Uint8Array): string {
  const message = passMessage(studentId, period);
  const signature = ed25519.sign(utf8(message), secretKey);
  return `${message}.${toBase64Url(signature)}`;
}

export function publicKeyFor(secretKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(secretKey);
}

export interface ParsedPass {
  studentId: string;
  period: number;
  message: string;
  signature: Uint8Array;
}

export function parsePass(raw: string): ParsedPass | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PASS_PREFIX) return null;
  const [, studentId, period36, signature64] = parts;
  if (!STUDENT_ID.test(studentId) || !/^[0-9a-z]{1,12}$/.test(period36)) return null;

  let signature: Uint8Array;
  try {
    signature = fromBase64Url(signature64);
  } catch {
    return null;
  }
  if (signature.length !== 64) return null;

  return {
    studentId,
    period: parseInt(period36, 36),
    message: `${PASS_PREFIX}.${studentId}.${period36}`,
    signature,
  };
}

export function hasValidSignature(pass: ParsedPass, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(pass.signature, utf8(pass.message), publicKey);
  } catch {
    return false;
  }
}

// ---- encoding helpers (no Buffer, so this file runs in the browser too) ----

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("not hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}
