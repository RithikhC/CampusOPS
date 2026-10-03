"use client";

import { CheckCircle2, Fingerprint, Loader2, Wifi, X, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { signal } from "@/components/feedback";
import { confirmWithPasskey } from "@/components/passkey";
import { Scanner } from "@/components/Scanner";
import { storage, uid } from "@/components/ui";
import type { RoomCheckInOutcome } from "@/lib/roomcheck";

type Step =
  | { name: "scan" }
  | { name: "confirm" }
  | { name: "sending" }
  | { name: "done"; outcome: RoomCheckInOutcome; fingerprint: boolean };

/** A random ID kept on this phone. The first room check-in registers it to the student. */
function deviceId(studentId: string): string {
  if (window.__nightpassDeviceOverride) return window.__nightpassDeviceOverride;
  const key = `np_device_${studentId}`;
  let id = storage.get<string | null>(key, null);
  if (!id) {
    id = uid();
    storage.set(key, id);
  }
  return id;
}

export function RoomCheckIn({
  studentId,
  studentName,
  room,
  challenge,
  credentialId,
  onClose,
}: {
  studentId: string;
  studentName: string;
  room: string;
  /** From the server, for the fingerprint check. */
  challenge: string;
  credentialId: string | null;
  onClose: (checkedIn: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "scan" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // The camera can read the tag several times before the screen updates; only the first read counts.
  const busy = useRef(false);

  async function submit(tag: string) {
    if (step.name !== "scan" || busy.current) return;
    busy.current = true;
    // The phone's own fingerprint / face check. Nothing biometric leaves the phone.
    setStep({ name: "confirm" });
    const attempt = await confirmWithPasskey({ studentId, studentName, challenge, credentialId });
    setStep({ name: "sending" });
    let outcome: RoomCheckInOutcome;
    try {
      const response = await fetch("/api/student/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag,
          deviceId: deviceId(studentId),
          challenge,
          passkey: attempt.kind === "proof" ? attempt.proof : undefined,
          passkeyFailed: attempt.kind === "failed",
          // Only honoured by the demo; a real server looks at the network itself.
          simulateOffCampus: Boolean(window.__nightpassOffCampus),
        }),
      });
      const body = await response.json();
      outcome = response.ok ? body : { ok: false, result: "invalid", message: body.error ?? "Couldn't check in. Try again." };
    } catch {
      outcome = { ok: false, result: "invalid", message: "No connection. Room check-in needs the hostel Wi-Fi." };
    }
    signal(outcome.ok ? (outcome.result === "late" ? "warn" : "ok") : "bad", true);
    setStep({ name: "done", outcome, fingerprint: attempt.kind === "proof" });
    if (outcome.ok) window.setTimeout(() => onClose(true), 1800);
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Check in from my room">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Check in from room {room}</h2>
          <button onClick={() => onClose(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-6" />
          </button>
        </div>

        {step.name === "done" ? (
          <div
            className={`animate-result flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center text-white ${
              step.outcome.ok ? (step.outcome.result === "late" ? "bg-[#a36200]" : "bg-[#0f7a3a]") : "bg-[#b42323]"
            }`}
            role="alert"
          >
            {step.outcome.ok ? <CheckCircle2 className="size-20" aria-hidden /> : <XCircle className="size-20" aria-hidden />}
            <div className="text-2xl font-bold">{step.outcome.ok ? "Checked in" : "Not checked in"}</div>
            <p className="max-w-xs text-lg">{step.outcome.message}</p>
            {step.outcome.ok && step.fingerprint && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-medium">
                <Fingerprint className="size-4" aria-hidden /> Fingerprint confirmed
              </span>
            )}
            {!step.outcome.ok && (
              <button
                onClick={() => {
                  busy.current = false;
                  setStep({ name: "scan" });
                }}
                className="mt-2 rounded-xl bg-white/20 px-5 py-2.5 font-semibold"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <>
            <ol className="flex flex-col gap-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <Wifi className="size-4 shrink-0 text-brand" aria-hidden /> Be in your room, connected to the hostel Wi-Fi.
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-4 shrink-0 place-items-center rounded-sm border border-brand text-[9px] font-bold text-brand">QR</span>
                Scan the NightPass tag on the back of your door.
              </li>
              <li className="flex items-center gap-2">
                <Fingerprint className="size-4 shrink-0 text-brand" aria-hidden /> Confirm it&apos;s you with your fingerprint or face.
              </li>
            </ol>

            <section className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black ring-1 ring-line" aria-label="Tag scanner">
              {!cameraError && (
                <Scanner paused={step.name !== "scan"} torch={false} onCode={submit} onTorchAvailable={() => undefined} onError={setCameraError} />
              )}
              {cameraError && step.name === "scan" && (
                <p className="absolute inset-0 grid place-items-center p-6 text-center text-muted">{cameraError}</p>
              )}
              {step.name === "confirm" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center text-white">
                  <Fingerprint className="size-14 text-brand" aria-hidden />
                  <span className="text-lg font-semibold">Tag scanned. Now confirm it&apos;s you.</span>
                  <span className="text-sm text-white/70">Use your fingerprint or face, the same way you unlock your phone.</span>
                </div>
              )}
              {step.name === "sending" && (
                <div className="absolute inset-0 grid place-items-center bg-black/60">
                  <Loader2 className="size-10 animate-spin text-white" aria-label="Checking" />
                </div>
              )}
              {!cameraError && (
                <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/80" aria-hidden />
              )}
            </section>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) void submit(typed.trim());
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Or paste the tag code"
                className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 font-mono text-sm ring-1 ring-line outline-none focus:ring-brand"
                aria-label="Tag code"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="h-11 rounded-xl bg-surface-2 px-4 text-sm font-medium ring-1 ring-line disabled:opacity-50" disabled={!typed.trim()}>
                Check
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
