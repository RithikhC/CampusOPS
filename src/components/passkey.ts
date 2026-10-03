/**
 * Asks the phone to confirm it's the student, with its own fingerprint / face / PIN check, using
 * a passkey for this site. First time: creates the passkey. After that: signs the server's
 * challenge with it. NightPass only ever receives the public key and signatures.
 */
import { toBase64Url } from "@/lib/pass";
import { challengeBytes, type PasskeyProof } from "@/lib/webauthn";

export type PasskeyAttempt =
  | { kind: "proof"; proof: PasskeyProof }
  /** The check was cancelled or not passed. */
  | { kind: "failed" }
  /** The phone has no fingerprint / face lock (or the browser doesn't support passkeys). */
  | { kind: "unavailable" };

export async function passkeyAvailable(): Promise<boolean> {
  try {
    return (
      typeof window.PublicKeyCredential !== "undefined" &&
      (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

function bytes(buffer: ArrayBuffer | null | undefined): string {
  return buffer ? toBase64Url(new Uint8Array(buffer)) : "";
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

export async function confirmWithPasskey(options: {
  studentId: string;
  studentName: string;
  challenge: string;
  /** The passkey already registered for this student, or null to set one up now. */
  credentialId: string | null;
}): Promise<PasskeyAttempt> {
  if (!(await passkeyAvailable())) return { kind: "unavailable" };
  const challenge = Uint8Array.from(challengeBytes(options.challenge));
  const rpId = window.location.hostname;

  try {
    if (options.credentialId) {
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId,
          allowCredentials: [{ type: "public-key", id: fromBase64Url(options.credentialId) }],
          userVerification: "required",
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!credential) return { kind: "failed" };
      const response = credential.response as AuthenticatorAssertionResponse;
      return {
        kind: "proof",
        proof: {
          kind: "get",
          credentialId: bytes(credential.rawId),
          clientDataJSON: bytes(response.clientDataJSON),
          authenticatorData: bytes(response.authenticatorData),
          signature: bytes(response.signature),
        },
      };
    }

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "NightPass", id: rpId },
        user: { id: new TextEncoder().encode(options.studentId), name: options.studentId, displayName: options.studentName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
        attestation: "none",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) return { kind: "failed" };
    const response = credential.response as AuthenticatorAttestationResponse;
    if (typeof response.getPublicKey !== "function" || typeof response.getAuthenticatorData !== "function") return { kind: "unavailable" };
    return {
      kind: "proof",
      proof: {
        kind: "create",
        credentialId: bytes(credential.rawId),
        clientDataJSON: bytes(response.clientDataJSON),
        authenticatorData: bytes(response.getAuthenticatorData()),
        publicKey: bytes(response.getPublicKey()),
      },
    };
  } catch (error) {
    // NotAllowedError: cancelled, timed out, or the fingerprint / face wasn't recognised.
    if ((error as { name?: string } | null)?.name === "NotAllowedError") return { kind: "failed" };
    return { kind: "unavailable" };
  }
}
