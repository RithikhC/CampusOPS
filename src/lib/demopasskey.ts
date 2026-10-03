/**
 * Demo only. The phones inside the browser demo have no fingerprint sensor, so they use a software
 * passkey instead: a P-256 key derived from the student and the phone. The demo data registers the
 * same key for the demo students, so their first check-in in the demo already asks for a
 * fingerprint. The server-side checks are exactly the ones a real phone's passkey goes through.
 */
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { toBase64Url } from "./pass";
import { spkiFromPoint } from "./webauthn";

const encoder = new TextEncoder();

export interface DemoPasskey {
  credentialId: string;
  secretKey: Uint8Array;
  /** SubjectPublicKeyInfo, base64url. */
  publicKey: string;
}

export function demoPasskey(studentId: string, deviceId: string): DemoPasskey {
  const secretKey = sha256(encoder.encode(`nightpass-demo-passkey:${studentId}:${deviceId}`));
  return {
    credentialId: toBase64Url(sha256(encoder.encode(`nightpass-demo-credential:${studentId}:${deviceId}`)).slice(0, 16)),
    secretKey,
    publicKey: toBase64Url(spkiFromPoint(p256.getPublicKey(secretKey, false))),
  };
}
