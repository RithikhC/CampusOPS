"use client";

import { CheckCircle2, LifeBuoy, Loader2, ScanLine, Siren, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { signal, unlockAudio } from "@/components/feedback";
import { Scanner } from "@/components/Scanner";
import { Avatar } from "@/components/ui";
import type { AssemblyScan, Headcount as HeadcountData } from "@/lib/emergency";
import { formatClock } from "@/lib/time";

/**
 * The guard's screen during an emergency headcount: scan passes at the assembly point to mark
 * students safe, and see who still isn't accounted for (rooms to check first at the top).
 */
export function Headcount({ sound }: { sound: boolean }) {
  const [data, setData] = useState<HeadcountData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<AssemblyScan | null>(null);
  const [error, setError] = useState(false);
  const seen = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/emergency", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      const body = await response.json();
      setData(body.emergency ? body : null);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), result.ok ? 1400 : 3000);
    return () => window.clearTimeout(timer);
  }, [result]);

  async function send(body: unknown) {
    const response = await fetch("/api/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("failed");
    return response.json();
  }

  async function onCode(raw: string) {
    // The same pass held in front of the camera is only counted once.
    const now = Date.now();
    if (result || now - (seen.current.get(raw) ?? 0) < 5000) return;
    seen.current.set(raw, now);
    try {
      const { scan, headcount } = (await send({ action: "scan", code: raw })) as { scan: AssemblyScan; headcount: HeadcountData | null };
      setResult(scan);
      if (headcount) setData(headcount);
      signal(scan.ok ? "ok" : "bad", sound);
    } catch {
      setResult({ ok: false, student: null, message: "No connection. Mark this student safe by hand." });
      signal("bad", sound);
    }
  }

  async function markSafe(studentId: string) {
    try {
      setData(await send({ action: "mark", studentId, status: "safe" }));
    } catch {
      setError(true);
    }
  }

  if (!data) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-muted">
        {error ? "No connection. Trying again…" : <><Loader2 className="size-5 animate-spin" aria-hidden /> Loading the headcount…</>}
      </p>
    );
  }

  const { summary, emergency } = data;
  const first = data.people.filter((p) => p.status === "help" || (p.status === "unaccounted" && p.likelyInside));

  return (
    <section aria-label="Emergency headcount" className="flex flex-col gap-3">
      <div className="rounded-2xl bg-[#7f1d1d] p-4 text-white ring-2 ring-[#ef4444]">
        <div className="flex items-center gap-2 font-bold">
          <Siren className="size-5 animate-pulse" aria-hidden /> {emergency.reason}
        </div>
        <div className="text-xs opacity-80">Started {formatClock(emergency.startedAt)}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Count value={summary.safe} label="safe" />
          <Count value={summary.help} label="need help" />
          <Count value={summary.unaccounted} label="not accounted for" />
        </div>
      </div>

      <section className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-black ring-1 ring-line" aria-label="Assembly point scanner">
        {scanning && !cameraError && <Scanner paused={Boolean(result)} torch={false} onCode={onCode} onTorchAvailable={() => undefined} onError={setCameraError} />}
        {!scanning && (
          <button
            onClick={() => {
              unlockAudio();
              setScanning(true);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white"
          >
            <span className="grid size-16 place-items-center rounded-full bg-brand-strong">
              <ScanLine className="size-8" aria-hidden />
            </span>
            <span className="text-lg font-semibold">Scan passes at the assembly point</span>
            <span className="text-sm text-muted">Each scan marks the student safe.</span>
          </button>
        )}
        {cameraError && <p className="absolute inset-0 grid place-items-center p-6 text-center text-muted">{cameraError}</p>}
        {result && (
          <div
            className={`animate-result absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white ${result.ok ? "bg-[#0f7a3a]" : "bg-[#b42323]"}`}
            role="alert"
          >
            {result.ok ? <CheckCircle2 className="size-14" aria-hidden /> : <XCircle className="size-14" aria-hidden />}
            <div className="text-2xl font-bold uppercase">{result.ok ? "Safe" : "Not counted"}</div>
            {result.student && (
              <div className="text-lg font-semibold">
                {result.student.name} · {result.student.room}
              </div>
            )}
            <div className="text-sm opacity-90">{result.message}</div>
          </div>
        )}
      </section>

      <div>
        <h3 className="px-1 text-sm font-medium">Check these rooms first ({first.length})</h3>
        <p className="px-1 text-xs text-muted">Asked for help, or checked in tonight and not safe yet.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {first.slice(0, 40).map((p) => (
            <li key={p.student.id} className={`flex items-center gap-3 rounded-xl bg-surface p-2.5 ring-1 ${p.status === "help" ? "ring-bad/60" : "ring-line"}`}>
              <span className="grid h-10 min-w-14 place-items-center rounded-lg bg-surface-2 px-1.5 text-sm font-semibold tabular-nums">{p.student.room}</span>
              <Avatar name={p.student.name} id={p.student.id} size={24} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.student.name}</div>
                <div className={`text-xs ${p.status === "help" ? "text-bad" : "text-muted"}`}>
                  {p.status === "help" ? (
                    <span className="inline-flex items-center gap-1">
                      <LifeBuoy className="size-3" aria-hidden /> Asked for help
                    </span>
                  ) : (
                    "Checked in tonight"
                  )}
                </div>
              </div>
              <button onClick={() => markSafe(p.student.id)} className="h-9 rounded-lg bg-ok/15 px-3 text-sm font-semibold text-ok ring-1 ring-ok/40">
                Safe
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-black/25 py-2">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] leading-tight opacity-85">{label}</div>
    </div>
  );
}
