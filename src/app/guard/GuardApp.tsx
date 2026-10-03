"use client";

import {
  CheckCircle2,
  CloudOff,
  Flashlight,
  FlashlightOff,
  Loader2,
  MapPin,
  RefreshCw,
  ScanLine,
  Siren,
  UserRoundSearch,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepScreenOn, signal, unlockAudio } from "@/components/feedback";
import { Scanner } from "@/components/Scanner";
import { Avatar, BASE_PATH, LogoutButton, Logo, ResultBadge, storage, uid } from "@/components/ui";
import { fromHex, parsePass } from "@/lib/pass";
import type { GuardBootstrap } from "@/lib/queries";
import type { IncomingScan, ScanOutcome } from "@/lib/scans";
import { formatClock } from "@/lib/time";
import {
  PRESENT_RESULTS,
  RESULT_META,
  verifyManual,
  verifyPass,
  type Presence,
  type RosterEntry,
  type ScanMethod,
  type Verdict,
  type VerifyContext,
} from "@/lib/verify";
import { Headcount } from "./Headcount";
import { ManualEntry } from "./ManualEntry";
import { ResultOverlay } from "./ResultOverlay";
import { Rounds } from "./Rounds";

interface RecentScan {
  clientId: string;
  atMs: number;
  verdict: Verdict;
  method: ScanMethod;
  synced: boolean;
  /** The server saw something this phone couldn't (e.g. the student was already scanned at another gate). */
  serverChanged: boolean;
}

const KEYS = {
  boot: "np_guard_boot",
  queue: "np_guard_queue",
  recent: "np_guard_recent",
  checkpoint: "np_guard_checkpoint",
  sound: "np_guard_sound",
};
/** Ignore the same code held in front of the camera, and a just-accepted student's next rotating code. */
const SAME_CODE_MS = 5000;
const SAME_STUDENT_MS = 8000;

export function GuardApp({ guardName }: { guardName: string }) {
  const [boot, setBoot] = useState<GuardBootstrap | null>(() => storage.get(KEYS.boot, null));
  const [offset, setOffset] = useState(() => (boot ? boot.serverNow - Date.now() : 0));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [checkpointId, setCheckpointId] = useState<string>(() => storage.get(KEYS.checkpoint, ""));
  const [queue, setQueue] = useState<IncomingScan[]>(() => storage.get(KEYS.queue, []));
  const [recent, setRecent] = useState<RecentScan[]>(() => storage.get(KEYS.recent, []));
  /** Students this phone accepted but the server may not know about yet (offline), per roll call. */
  const [local, setLocal] = useState<{ rollCallId?: number; present: Record<string, Presence> }>({ present: {} });
  const [sound, setSound] = useState<boolean>(() => storage.get(KEYS.sound, true));
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"gate" | "rounds" | "headcount">("gate");
  const [shownEmergency, setShownEmergency] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [overlay, setOverlay] = useState<Verdict | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const queueRef = useRef(queue);
  const recentRef = useRef(recent);
  const flushing = useRef(false);
  const seenCodes = useRef(new Map<string, number>());
  const acceptedStudents = useRef(new Map<string, number>());

  // ------------------------------------------------------------ data

  const rollCallId = boot?.rollCall.id;
  // A new roll call (next night, or the warden started a fresh one) starts with a clean slate.
  const localPresent = useMemo(() => (local.rollCallId === rollCallId ? local.present : {}), [local, rollCallId]);

  const loadBoot = useCallback(async () => {
    try {
      const response = await fetch("/api/guard/bootstrap", { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace(`${BASE_PATH}/`);
        return;
      }
      if (!response.ok) throw new Error("bootstrap failed");
      const data = (await response.json()) as GuardBootstrap;
      setBoot(data);
      setOffset(data.serverNow - Date.now());
      setNow(Date.now());
      setOnline(true);
      storage.set(KEYS.boot, data);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    acceptedStudents.current.clear();
  }, [rollCallId]);

  const updateRecent = useCallback((update: (items: RecentScan[]) => RecentScan[]) => {
    recentRef.current = update(recentRef.current).slice(0, 30);
    setRecent(recentRef.current);
    storage.set(KEYS.recent, recentRef.current);
  }, []);

  const setQueued = useCallback((items: IncomingScan[]) => {
    queueRef.current = items;
    setQueue(items);
    storage.set(KEYS.queue, items);
  }, []);

  /** Sends queued scans in batches. Safe to call any time; the server ignores scans it already has. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queueRef.current.length > 0) {
        const response = await fetch("/api/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scans: queueRef.current.slice(0, 50) }),
        });
        if (response.status === 401) {
          setNotice("Your session expired. Sign in again to sync queued scans.");
          return;
        }
        if (!response.ok) throw new Error("sync failed");
        const { results } = (await response.json()) as { results: ScanOutcome[] };
        const byId = new Map(results.map((r) => [r.clientId, r]));
        setQueued(queueRef.current.filter((s) => !byId.has(s.clientId)));
        setOnline(true);

        const changed: string[] = [];
        updateRecent((items) =>
          items.map((item) => {
            const outcome = byId.get(item.clientId);
            if (!outcome) return item;
            const differs = outcome.result !== item.verdict.result;
            if (differs) {
              changed.push(`${outcome.student?.name ?? outcome.claimedId ?? "Scan"}: ${RESULT_META[outcome.result].label}. ${outcome.reason}`);
            }
            return {
              ...item,
              synced: true,
              serverChanged: item.serverChanged || differs,
              verdict: differs
                ? { ...item.verdict, result: outcome.result, reason: outcome.reason, student: outcome.student ?? item.verdict.student }
                : item.verdict,
            };
          }),
        );
        if (changed.length) setNotice(`Updated by server: ${changed.join(" · ")}`);
      }
    } catch {
      setOnline(false);
    } finally {
      flushing.current = false;
    }
  }, [setQueued, updateRecent]);

  useEffect(() => {
    const first = window.setTimeout(() => {
      void loadBoot();
      void flush();
    }, 0);
    const refresh = window.setInterval(loadBoot, 15_000);
    const sync = window.setInterval(flush, 3_000);
    const tick = window.setInterval(() => setNow(Date.now()), 20_000);
    const goOnline = () => {
      setOnline(true);
      void flush();
      void loadBoot();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(refresh);
      window.clearInterval(sync);
      window.clearInterval(tick);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [loadBoot, flush]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => (scanning ? keepScreenOn() : undefined), [scanning]);

  // ------------------------------------------------------------ verification

  const publicKey = useMemo(() => (boot ? fromHex(boot.publicKeyHex) : null), [boot]);
  const roster = useMemo(() => new Map((boot?.roster ?? []).map((s) => [s.id, s])), [boot]);
  const serverPresent = useMemo(
    () => new Map((boot?.present ?? []).map((p) => [p.studentId, { atMs: Date.parse(p.at), checkpoint: p.checkpoint }])),
    [boot],
  );
  const checkpoint = boot?.checkpoints.find((c) => c.id === checkpointId) ?? boot?.checkpoints[0];

  const findPresence = useCallback(
    (id: string): Presence | undefined => serverPresent.get(id) ?? localPresent[id],
    [serverPresent, localPresent],
  );

  function context(): VerifyContext | null {
    if (!boot || !publicKey) return null;
    return {
      nowMs: Date.now() + offset,
      publicKey,
      curfewAtMs: Date.parse(boot.rollCall.curfewAt),
      findStudent: (id) => roster.get(id),
      findPresence,
    };
  }

  function commit(verdict: Verdict, input: Pick<IncomingScan, "method" | "raw" | "studentId" | "note">) {
    if (!checkpoint) return;
    const scannedAt = Date.now() + offset;
    const clientId = uid();
    setOverlay(verdict);
    signal(RESULT_META[verdict.result].tone, sound);

    if (verdict.student && PRESENT_RESULTS.includes(verdict.result)) {
      const student = verdict.student;
      setLocal((l) => ({
        rollCallId,
        present: {
          ...(l.rollCallId === rollCallId ? l.present : {}),
          [student.id]: { atMs: scannedAt, checkpoint: checkpoint.name },
        },
      }));
      acceptedStudents.current.set(student.id, Date.now());
    }

    setQueued([...queueRef.current, { ...input, clientId, checkpointId: checkpoint.id, scannedAt, offline: !online }]);
    updateRecent((items) => [{ clientId, atMs: scannedAt, verdict, method: input.method, synced: false, serverChanged: false }, ...items]);
    void flush();
  }

  function handleCode(raw: string, fromCamera = true) {
    if (overlay || (fromCamera && manualOpen)) return;
    const ctx = context();
    if (!ctx) return;

    if (fromCamera) {
      const now = Date.now();
      const studentId = parsePass(raw)?.studentId;
      const lastSeen = seenCodes.current.get(raw);
      const acceptedAt = studentId ? acceptedStudents.current.get(studentId) : undefined;
      const lingering =
        (lastSeen !== undefined && now - lastSeen < SAME_CODE_MS) ||
        (acceptedAt !== undefined && now - acceptedAt < SAME_STUDENT_MS);
      seenCodes.current.set(raw, now);
      if (studentId && acceptedAt !== undefined && lingering) acceptedStudents.current.set(studentId, now);
      if (seenCodes.current.size > 200) seenCodes.current.clear();
      if (lingering) return;
    }

    commit(verifyPass(raw, ctx), { method: "qr", raw });
  }

  function handleManual(student: RosterEntry, note: string) {
    const ctx = context();
    if (!ctx) return;
    setManualOpen(false);
    commit(verifyManual(student.id, note, ctx), { method: "manual", studentId: student.id, note });
  }

  const dismissOverlay = useCallback(() => setOverlay(null), []);

  // ------------------------------------------------------------ view

  if (!boot) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center text-muted">
        {online ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading roster…
          </span>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <WifiOff className="size-8" aria-hidden />
            Connect to the internet once to download tonight&apos;s roster.
            <button onClick={loadBoot} className="rounded-lg bg-surface-2 px-4 py-2 ring-1 ring-line">
              Try again
            </button>
          </div>
        )}
      </main>
    );
  }

  // When a headcount starts, switch straight to it (once); when it ends, go back to the gate.
  const emergency = boot.emergency ?? null;
  if (emergency && emergency.id !== shownEmergency) {
    setShownEmergency(emergency.id);
    setMode("headcount");
  }
  const view = mode === "headcount" && !emergency ? "gate" : mode;
  const modes = emergency ? (["headcount", "gate", "rounds"] as const) : (["gate", "rounds"] as const);

  const presentIds = new Set([...serverPresent.keys(), ...Object.keys(localPresent)]);
  const expected = boot.roster.length;
  const curfewAt = Date.parse(boot.rollCall.curfewAt);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pt-3 pb-6">
      <header className="flex items-center justify-between">
        <Logo subtitle={guardName} />
        <div className="flex items-center gap-1">
          <SyncPill online={online} queued={queue.length} />
          <LogoutButton compact />
        </div>
      </header>

      <div className={`grid gap-1 rounded-xl bg-surface p-1 ring-1 ring-line ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={view === m}
            className={`flex h-10 items-center justify-center gap-1 rounded-lg text-sm font-medium ${
              m === "headcount" ? (view === m ? "bg-bad text-white" : "text-bad") : view === m ? "bg-surface-2 text-text ring-1 ring-line" : "text-muted"
            }`}
          >
            {m === "headcount" && <Siren className="size-4" aria-hidden />}
            {m === "gate" ? "Gate scan" : m === "rounds" ? "Room rounds" : "Headcount"}
          </button>
        ))}
      </div>

      {view === "headcount" ? (
        <Headcount sound={sound} />
      ) : view === "rounds" ? (
        <Rounds />
      ) : (
        <>
      <label className="flex items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line">
        <MapPin className="size-5 shrink-0 text-brand" aria-hidden />
        <span className="sr-only">Checkpoint</span>
        <select
          value={checkpoint?.id}
          onChange={(e) => {
            setCheckpointId(e.target.value);
            storage.set(KEYS.checkpoint, e.target.value);
          }}
          className="h-12 flex-1 bg-transparent text-base font-medium outline-none"
        >
          {boot.checkpoints.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface">
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="checked in" value={`${presentIds.size}/${expected}`} />
        <Stat label={now + offset > curfewAt ? "curfew (passed)" : "curfew"} value={formatClock(curfewAt)} />
        <Stat label="need review" value={`${boot.flagsOpen}`} />
      </div>

      <section className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black ring-1 ring-line" aria-label="Scanner">
        {scanning && !cameraError && (
          <Scanner
            paused={Boolean(overlay) || manualOpen}
            torch={torch}
            onCode={(text) => handleCode(text)}
            onTorchAvailable={setTorchAvailable}
            onError={setCameraError}
          />
        )}

        {scanning && !cameraError && (
          <div className="pointer-events-none absolute inset-[12%]" aria-hidden>
            {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
              "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c) => (
              <span key={c} className={`absolute size-10 border-white/90 ${c}`} />
            ))}
            <span className="animate-scanline absolute inset-x-3 h-0.5 rounded-full bg-brand/80" />
          </div>
        )}

        {!scanning && (
          <button
            onClick={() => {
              unlockAudio();
              setCameraError(null);
              setScanning(true);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white"
          >
            <span className="grid size-24 place-items-center rounded-full bg-brand-strong">
              <ScanLine className="size-12" aria-hidden />
            </span>
            <span className="text-xl font-semibold">Start scanning</span>
            <span className="max-w-60 text-sm text-muted">Then point the camera at the student&apos;s QR pass. The screen stays on while you scan.</span>
          </button>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-muted">{cameraError}</p>
            <button onClick={() => setManualOpen(true)} className="rounded-xl bg-surface-2 px-4 py-2.5 font-medium ring-1 ring-line">
              Use manual entry
            </button>
          </div>
        )}

        {scanning && !cameraError && (
          <div className="absolute inset-x-0 bottom-0 flex justify-between p-3">
            <RoundButton
              label={sound ? "Mute sounds" : "Unmute sounds"}
              onClick={() => {
                setSound(!sound);
                storage.set(KEYS.sound, !sound);
              }}
            >
              {sound ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
            </RoundButton>
            {torchAvailable && (
              <RoundButton label={torch ? "Turn torch off" : "Turn torch on"} onClick={() => setTorch(!torch)} active={torch}>
                {torch ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
              </RoundButton>
            )}
          </div>
        )}
      </section>

      <button
        onClick={() => setManualOpen(true)}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-base font-semibold ring-1 ring-line active:scale-[0.99]"
      >
        <UserRoundSearch className="size-5" aria-hidden /> Manual entry
      </button>

      <section aria-label="Recent scans" className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-sm text-muted">
          <h2>Scanned on this phone</h2>
          <button onClick={loadBoot} className="inline-flex items-center gap-1 hover:text-text" aria-label="Refresh">
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </button>
        </div>
        {recent.length === 0 && <p className="px-1 text-sm text-muted">No scans yet.</p>}
        <ul className="flex flex-col gap-2">
          {recent.slice(0, 12).map((item) => (
            <li key={item.clientId} className="flex items-center gap-3 rounded-xl bg-surface p-2.5 ring-1 ring-line">
              {item.verdict.student ? (
                <Avatar name={item.verdict.student.name} id={item.verdict.student.id} size={36} />
              ) : (
                <span className="size-9 shrink-0 rounded-full bg-surface-2" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {item.verdict.student?.name ?? item.verdict.claimedId ?? "Unreadable code"}
                </div>
                <div className="truncate text-xs text-muted">
                  {formatClock(item.atMs, true)}
                  {item.method === "manual" && " · manual"}
                  {item.serverChanged && ` · ${item.verdict.reason}`}
                </div>
              </div>
              <ResultBadge result={item.verdict.result} />
              {item.synced ? (
                <CheckCircle2 className="size-4 shrink-0 text-muted" aria-label="Synced" />
              ) : (
                <CloudOff className="size-4 shrink-0 text-warn" aria-label="Waiting to sync" />
              )}
            </li>
          ))}
        </ul>
      </section>
        </>
      )}

      {manualOpen && (
        <ManualEntry
          roster={boot.roster}
          findPresence={findPresence}
          onManual={handleManual}
          onCode={(raw) => {
            setManualOpen(false);
            handleCode(raw, false);
          }}
          onClose={() => setManualOpen(false)}
        />
      )}

      {overlay && <ResultOverlay verdict={overlay} onDismiss={dismissOverlay} />}

      {notice && (
        <div role="status" className="animate-result fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl bg-warn px-4 py-3 text-sm font-medium text-black shadow-lg">
          {notice}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-2 ring-1 ring-line">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs leading-tight text-muted">{label}</div>
    </div>
  );
}

function RoundButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-14 place-items-center rounded-full ${active ? "bg-warn text-black" : "bg-black/60 text-white"}`}
    >
      {children}
    </button>
  );
}

function SyncPill({ online, queued }: { online: boolean; queued: number }) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-medium text-warn ring-1 ring-warn/30">
        <WifiOff className="size-3.5" aria-hidden /> Offline{queued ? ` · ${queued} queued` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok ring-1 ring-ok/30">
      {queued ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Wifi className="size-3.5" aria-hidden />}
      {queued ? `Syncing ${queued}` : "Online"}
    </span>
  );
}
