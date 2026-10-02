"use client";

import { CheckCircle2, Loader2, Wifi, X, XCircle } from "lucide-react";
import { useState } from "react";
import { signal } from "@/components/feedback";
import { Scanner } from "@/components/Scanner";
import { storage, uid } from "@/components/ui";
import type { RoomCheckInOutcome } from "@/lib/roomcheck";

type Step = { name: "scan" } | { name: "sending" } | { name: "done"; outcome: RoomCheckInOutcome };

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

export function RoomCheckIn({ studentId, room, onClose }: { studentId: string; room: string; onClose: (checkedIn: boolean) => void }) {
  const [step, setStep] = useState<Step>({ name: "scan" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  async function submit(tag: string) {
    if (step.name !== "scan") return;
    setStep({ name: "sending" });
    let outcome: RoomCheckInOutcome;
    try {
      const response = await fetch("/api/student/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // simulateOffCampus is only honoured by the demo; a real server looks at the network itself.
        body: JSON.stringify({ tag, deviceId: deviceId(studentId), simulateOffCampus: Boolean(window.__nightpassOffCampus) }),
      });
      const body = await response.json();
      outcome = response.ok ? body : { ok: false, result: "invalid", message: body.error ?? "Couldn't check in. Try again." };
    } catch {
      outcome = { ok: false, result: "invalid", message: "No connection. Room check-in needs the hostel Wi-Fi." };
    }
    signal(outcome.ok ? (outcome.result === "late" ? "warn" : "ok") : "bad", true);
    setStep({ name: "done", outcome });
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
            {!step.outcome.ok && (
              <button onClick={() => setStep({ name: "scan" })} className="mt-2 rounded-xl bg-white/20 px-5 py-2.5 font-semibold">
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
            </ol>

            <section className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black ring-1 ring-line" aria-label="Tag scanner">
              {!cameraError && (
                <Scanner paused={step.name !== "scan"} torch={false} onCode={submit} onTorchAvailable={() => undefined} onError={setCameraError} />
              )}
              {cameraError && <p className="absolute inset-0 grid place-items-center p-6 text-center text-muted">{cameraError}</p>}
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
