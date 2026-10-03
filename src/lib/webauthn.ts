/**
 * Fingerprint / face confirmation for room check-ins, using passkeys (WebAuthn).
 *
 * The first time a student checks in, their phone creates a passkey for NightPass. The private
 * key stays in the phone's secure hardware and can only be used after the phone's own fingerprint,
 * face or PIN check. NightPass never sees any biometric data: it only stores the public key, and
 * on every later check-in verifies a signature that the phone can only make after that check.
 *
 * Kept free of Node-only imports so the browser demo verifies passkeys with the same code.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fromBase64Url, toBase64Url } from "./pass";

const encoder = new TextEncoder();
const CHALLENGE_PREFIX = "NC1";
/** How long a check-in challenge stays usable. */
export const CHALLENGE_MINUTES = 10;
/** DER header of a P-256 public key in SubjectPublicKeyInfo form; the 65-byte point follows it. */
const P256_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
  0x01, 0x07, 0x03, 0x42, 0x00,
]);
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

/** What the student's phone sends with a check-in. All binary fields are base64url. */
export interface PasskeyProof {
  kind: "create" | "get";
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  /** "get" only: DER-encoded ES256 signature. */
  signature?: string;
  /** "create" only: the new public key (SubjectPublicKeyInfo). */
  publicKey?: string;
}

export interface PasskeyExpectations {
  challenge: string;
  origin: string;
  rpId: string;
  /** The public key registered for this student, for a "get". */
  publicKey?: string | null;
}

export type PasskeyCheck = { ok: true; publicKey: string } | { ok: false; reason: string };

/** A challenge the server can check later without storing it: signed, tied to one student, short-lived. */
export function issueChallenge(studentId: string, nowMs: number, secretKey: Uint8Array): string {
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(12)));
  const message = `${CHALLENGE_PREFIX}.${studentId}.${(nowMs + CHALLENGE_MINUTES * 60_000).toString(36)}.${nonce}`;
  return `${message}.${toBase64Url(ed25519.sign(encoder.encode(message), secretKey))}`;
}

export function checkChallenge(challenge: string, studentId: string, nowMs: number, publicKey: Uint8Array): boolean {
  const parts = challenge.split(".");
  if (parts.length !== 5 || parts[0] !== CHALLENGE_PREFIX || parts[1] !== studentId) return false;
  if (parseInt(parts[2], 36) < nowMs) return false;
  try {
    return ed25519.verify(fromBase64Url(parts[4]), encoder.encode(parts.slice(0, 4).join(".")), publicKey);
  } catch {
    return false;
  }
}

/** The bytes the phone is asked to sign: the challenge text itself. */
export function challengeBytes(challenge: string): Uint8Array {
  return encoder.encode(challenge);
}

export function spkiFromPoint(point: Uint8Array): Uint8Array {
  const spki = new Uint8Array(P256_SPKI_PREFIX.length + point.length);
  spki.set(P256_SPKI_PREFIX);
  spki.set(point, P256_SPKI_PREFIX.length);
  return spki;
}

function pointFromSpki(spki: Uint8Array): Uint8Array | null {
  if (spki.length !== P256_SPKI_PREFIX.length + 65) return null;
  if (!P256_SPKI_PREFIX.every((byte, i) => spki[i] === byte)) return null;
  return spki.slice(P256_SPKI_PREFIX.length);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** Checks what the phone sent: right site, right challenge, user verified, and (for "get") a valid signature. */
export function verifyPasskey(proof: PasskeyProof, expected: PasskeyExpectations): PasskeyCheck {
  try {
    const clientDataBytes = fromBase64Url(proof.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as { type?: string; challenge?: string; origin?: string };
    if (clientData.type !== (proof.kind === "create" ? "webauthn.create" : "webauthn.get")) return { ok: false, reason: "wrong request type" };
    if (clientData.challenge !== toBase64Url(challengeBytes(expected.challenge))) return { ok: false, reason: "challenge doesn't match" };
    if (clientData.origin !== expected.origin) return { ok: false, reason: "made for a different website" };

    const authData = fromBase64Url(proof.authenticatorData);
    if (authData.length < 37) return { ok: false, reason: "malformed authenticator data" };
    if (!sameBytes(authData.slice(0, 32), sha256(encoder.encode(expected.rpId)))) return { ok: false, reason: "made for a different website" };
    const flags = authData[32];
    if (!(flags & FLAG_USER_PRESENT) || !(flags & FLAG_USER_VERIFIED)) return { ok: false, reason: "fingerprint or face was not checked" };

    if (proof.kind === "create") {
      const spki = proof.publicKey ? fromBase64Url(proof.publicKey) : null;
      const point = spki && pointFromSpki(spki);
      if (!point) return { ok: false, reason: "unsupported key type" };
      p256.Point.fromBytes(point); // throws if it isn't a valid curve point
      return { ok: true, publicKey: proof.publicKey! };
    }

    const point = expected.publicKey ? pointFromSpki(fromBase64Url(expected.publicKey)) : null;
    if (!point || !proof.signature) return { ok: false, reason: "no passkey registered" };
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData);
    signed.set(sha256(clientDataBytes), authData.length);
    // Authenticators don't normalise S, so high-S signatures are valid here.
    const valid = p256.verify(fromBase64Url(proof.signature), signed, point, { format: "der", lowS: false });
    return valid ? { ok: true, publicKey: expected.publicKey! } : { ok: false, reason: "signature doesn't match" };
  } catch {
    return { ok: false, reason: "malformed passkey response" };
  }
}

/** The origin and passkey "relying party" ID a request was made for, worked out from its headers. */
export function siteFromHeaders(headers: Headers, fallbackUrl: string): { origin: string; rpId: string } {
  const url = new URL(fallbackUrl);
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host") || url.host;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  return { origin: `${proto}://${host}`, rpId: host.replace(/:\d+$/, "") };
}

/** Validates the shape of a passkey response from a request body. */
export function parsePasskeyProof(value: unknown): PasskeyProof | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const text = (field: unknown, max: number) => typeof field === "string" && field.length > 0 && field.length <= max && /^[A-Za-z0-9_-]+$/.test(field);
  if (v.kind !== "create" && v.kind !== "get") return null;
  if (!text(v.credentialId, 1400) || !text(v.clientDataJSON, 4000) || !text(v.authenticatorData, 4000)) return null;
  if (v.kind === "get" && !text(v.signature, 400)) return null;
  if (v.kind === "create" && !text(v.publicKey, 400)) return null;
  return {
    kind: v.kind,
    credentialId: v.credentialId as string,
    clientDataJSON: v.clientDataJSON as string,
    authenticatorData: v.authenticatorData as string,
    signature: v.kind === "get" ? (v.signature as string) : undefined,
    publicKey: v.kind === "create" ? (v.publicKey as string) : undefined,
  };
}
