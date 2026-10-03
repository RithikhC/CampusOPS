/**
 * A stand-in fingerprint sensor for the student phone in the browser demo. It answers the app's
 * passkey requests (navigator.credentials) with a software key, after showing a fingerprint
 * prompt like a phone's. The responses have the same format as a real phone's, so the check-in
 * goes through exactly the same verification.
 *
 * The demo page can make the next fingerprint "not recognised" (window.__nightpassFingerprint).
 */
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { demoPasskey } from "@/lib/demopasskey";
import { fromBase64Url, toBase64Url } from "@/lib/pass";
import { spkiFromPoint } from "@/lib/webauthn";

declare global {
  interface Window {
    /** Demo only: "fail" makes the next fingerprint check fail (someone else's finger). */
    __nightpassFingerprint?: "fail";
  }
}

const FINGERPRINT_SVG = `<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>`;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** A bottom sheet like a phone's fingerprint prompt. Resolves true if the finger is "recognised". */
async function fingerprintPrompt(subtitle: string, outcome: "ok" | "fail" | "none"): Promise<boolean> {
  const sheet = document.createElement("div");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Fingerprint check");
  sheet.style.cssText =
    "position:fixed;inset:0;z-index:100;display:flex;align-items:flex-end;background:rgba(0,0,0,0.45);font-family:inherit;";
  sheet.innerHTML = `
    <div style="width:100%;background:#1f2430;color:#e6e9ef;border-radius:26px 26px 0 0;padding:22px 22px 30px;text-align:center;box-shadow:0 -10px 30px rgba(0,0,0,.4);transform:translateY(100%);transition:transform .25s ease-out">
      <div style="font-size:13px;color:#9aa3b5">NightPass</div>
      <div style="margin-top:4px;font-size:20px;font-weight:600">Confirm it's you</div>
      <div data-sub style="margin-top:4px;font-size:14px;color:#9aa3b5">${subtitle}</div>
      <div data-ring style="margin:18px auto 10px;width:78px;height:78px;border-radius:999px;display:grid;place-items:center;color:#60a5fa;background:rgba(96,165,250,.12);transition:all .2s">${FINGERPRINT_SVG}</div>
      <div data-msg style="font-size:14px;color:#9aa3b5">Touch the fingerprint sensor</div>
    </div>`;
  document.body.appendChild(sheet);
  const panel = sheet.firstElementChild as HTMLElement;
  const ring = sheet.querySelector<HTMLElement>("[data-ring]")!;
  const msg = sheet.querySelector<HTMLElement>("[data-msg]")!;
  await wait(30);
  panel.style.transform = "translateY(0)";
  await wait(1250);

  if (outcome === "ok") {
    ring.style.color = "#22c55e";
    ring.style.background = "rgba(34,197,94,.15)";
    msg.textContent = "Fingerprint recognised";
    await wait(550);
  } else {
    ring.style.color = "#ef4444";
    ring.style.background = "rgba(239,68,68,.15)";
    msg.style.color = "#fca5a5";
    msg.textContent = outcome === "fail" ? "Fingerprint not recognised" : "No NightPass passkey for this account on this phone";
    await wait(1300);
  }
  panel.style.transform = "translateY(100%)";
  await wait(220);
  sheet.remove();
  return outcome === "ok";
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toBytes(source: BufferSource): Uint8Array {
  return source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

const buffer = (bytes: Uint8Array) => bytes.slice().buffer;

function notAllowed(): DOMException {
  return new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
}

export function installFakeAuthenticator(studentId: string, currentDevice: () => string): void {
  const encoder = new TextEncoder();

  function clientData(type: string, challenge: BufferSource): Uint8Array {
    return encoder.encode(JSON.stringify({ type, challenge: toBase64Url(toBytes(challenge)), origin: window.location.origin, crossOrigin: false }));
  }

  function authenticatorData(rpId: string): Uint8Array {
    // rpIdHash, flags (user present + user verified), signature counter.
    return concat(sha256(encoder.encode(rpId)), Uint8Array.of(0x05), Uint8Array.of(0, 0, 0, 1));
  }

  async function create(options?: CredentialCreationOptions): Promise<Credential | null> {
    const request = options?.publicKey;
    if (!request) throw notAllowed();
    const failNext = window.__nightpassFingerprint === "fail";
    window.__nightpassFingerprint = undefined;
    if (!(await fingerprintPrompt("Set up fingerprint check-in", failNext ? "fail" : "ok"))) throw notAllowed();
    const key = demoPasskey(studentId, currentDevice());
    const authData = authenticatorData(request.rp.id ?? window.location.hostname);
    const response = {
      clientDataJSON: buffer(clientData("webauthn.create", request.challenge)),
      getAuthenticatorData: () => buffer(authData),
      getPublicKey: () => buffer(spkiFromPoint(p256.getPublicKey(key.secretKey, false))),
      getPublicKeyAlgorithm: () => -7,
    };
    return { id: key.credentialId, rawId: buffer(fromBase64Url(key.credentialId)), type: "public-key", response } as unknown as Credential;
  }

  async function get(options?: CredentialRequestOptions): Promise<Credential | null> {
    const request = options?.publicKey;
    if (!request) throw notAllowed();
    const failNext = window.__nightpassFingerprint === "fail";
    window.__nightpassFingerprint = undefined;
    const key = demoPasskey(studentId, currentDevice());
    const wanted = (request.allowCredentials ?? []).map((c) => toBase64Url(toBytes(c.id)));
    const hasKey = wanted.length === 0 || wanted.includes(key.credentialId);
    if (!(await fingerprintPrompt("Check in from your room", !hasKey ? "none" : failNext ? "fail" : "ok"))) throw notAllowed();

    const clientDataJSON = clientData("webauthn.get", request.challenge);
    const authData = authenticatorData(request.rpId ?? window.location.hostname);
    const signature = p256.sign(concat(authData, sha256(clientDataJSON)), key.secretKey, { format: "der" });
    const response = {
      clientDataJSON: buffer(clientDataJSON),
      authenticatorData: buffer(authData),
      signature: buffer(signature),
      userHandle: buffer(encoder.encode(studentId)),
    };
    return { id: key.credentialId, rawId: buffer(fromBase64Url(key.credentialId)), type: "public-key", response } as unknown as Credential;
  }

  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create, get } });
  Object.defineProperty(window, "PublicKeyCredential", {
    configurable: true,
    value: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
  });
}
