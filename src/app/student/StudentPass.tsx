"use client";

import { CheckCircle2, Clock, DoorOpen, LifeBuoy, ShieldCheck, Siren, Sun, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { keepScreenOn, signal, unlockAudio } from "@/components/feedback";
import { QrCode } from "@/components/QrCode";
import { Avatar, Card, LogoutButton, Logo, ResultBadge, storage } from "@/components/ui";
import { periodAt, periodStartMs } from "@/lib/pass";
import type { StudentPassData } from "@/lib/queries";
import { formatClock, formatDate } from "@/lib/time";
import { RESULT_META } from "@/lib/verify";
import { RoomCheckIn } from "./RoomCheckIn";

interface CachedPass {
  data: StudentPassData;
  offset: number;
}

export function StudentPass({ studentId }: { studentId: string }) {
  const cacheKey = `np_pass_${studentId}`;
  // Start from the last pass saved on this phone, so it shows instantly and works without signal.
  const [cached] = useState(() => storage.get<CachedPass | null>(cacheKey, null));
  const [data, setData] = useState<StudentPassData | null>(cached?.data ?? null);
  const [offset, setOffset] = useState(cached?.offset ?? 0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [checkingIn, setCheckingIn] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Keep the pass fresh. Poll faster until checked in so the confirmation shows right after the scan.
  // Once checked in, keep polling often enough that an emergency headcount reaches the phone quickly.
  const checkedIn = Boolean(data?.status) && !data?.emergency;
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/student/pass", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load your pass");
        if (cancelled) return;
        const fresh = body as StudentPassData;
        const newOffset = fresh.serverNow - Date.now();
        setData(fresh);
        setOffset(newOffset);
        setOnline(true);
        setError(null);
        storage.set(cacheKey, { data: fresh, offset: newOffset });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof TypeError) setOnline(false);
        else setError((e as Error).message);
      }
    }

    void load();
    const timer = window.setInterval(load, checkedIn ? 10_000 : 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkedIn, cacheKey, refresh]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const release = keepScreenOn();
    const goOnline = () => {
      setOnline(true);
      setRefresh((n) => n + 1);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearInterval(tick);
      release();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Sound and vibrate once when a headcount starts.
  const alerted = useRef<number | null>(null);
  const emergencyId = data?.emergency?.id ?? null;
  useEffect(() => {
    if (emergencyId && alerted.current !== emergencyId) {
      alerted.current = emergencyId;
      signal("bad", true);
    }
  }, [emergencyId]);

  const serverNow = now + offset;
  const period = periodAt(serverNow);
  const code = data?.codes.find((c) => c.period === period)?.code ?? null;
  const lastCode = data?.codes.at(-1);
  const preloadedMinutes = lastCode ? Math.max(0, Math.floor((periodStartMs(lastCode.period) - serverNow) / 60_000)) : 0;
  const periodMs = (data?.periodSeconds ?? 15) * 1000;
  const remaining = periodMs - (serverNow - periodStartMs(period));

  if (error && !data) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-bad">{error}</p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return <main className="grid min-h-dvh place-items-center text-muted">Loading your pass…</main>;
  }

  const { student, rollCall, status } = data;
  const curfewAt = Date.parse(rollCall.curfewAt);
  const minutesToCurfew = Math.round((curfewAt - serverNow) / 60_000);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-4 pb-8">
      <header className="flex items-center justify-between">
        <Logo subtitle="My night pass" />
        <LogoutButton compact />
      </header>

      {data.emergency && <EmergencyCard emergency={data.emergency} onAnswered={() => setRefresh((n) => n + 1)} />}

      <Card className="flex items-center gap-3 p-4">
        <Avatar name={student.name} id={student.id} size={52} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{student.name}</div>
          <div className="font-mono text-sm text-muted">{student.id}</div>
          <div className="text-sm text-muted">
            {student.hostel} · Room {student.room}
          </div>
        </div>
      </Card>

      {status ? (
        <div
          className={`flex items-center gap-3 rounded-2xl p-4 ring-1 ${
            RESULT_META[status.result].tone === "ok" ? "bg-ok/15 ring-ok/30" : "bg-warn/15 ring-warn/30"
          }`}
          role="status"
        >
          <CheckCircle2 className={`size-8 shrink-0 ${RESULT_META[status.result].tone === "ok" ? "text-ok" : "text-warn"}`} aria-hidden />
          <div>
            <div className="font-semibold">You&apos;re checked in for tonight</div>
            <div className="text-sm text-muted">
              {formatClock(status.at)} ·{" "}
              {status.method === "self" ? "from your room" : status.method === "round" ? "seen by the warden" : (status.checkpoint ?? "Gate")}
              {status.result !== "valid" && <> · {RESULT_META[status.result].label}</>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line" role="status">
          <Clock className="size-7 shrink-0 text-brand" aria-hidden />
          <div>
            <div className="font-semibold">Not checked in yet</div>
            <div className="text-sm text-muted">
              Curfew {formatClock(curfewAt)}
              {minutesToCurfew > 0 ? ` · in ${minutesToCurfew} min` : ` · ${-minutesToCurfew} min ago`}
            </div>
          </div>
        </div>
      )}

      {!status && (
        <button
          onClick={() => {
            unlockAudio();
            setCheckingIn(true);
          }}
          disabled={!data.roomCheckIn.open}
          className="flex items-center gap-3 rounded-2xl bg-brand-strong p-4 text-left text-white active:scale-[0.99] disabled:bg-surface-2 disabled:text-muted"
        >
          <DoorOpen className="size-8 shrink-0" aria-hidden />
          <span>
            <span className="block text-lg font-semibold">Check in from my room</span>
            <span className="block text-sm opacity-90">
              {data.roomCheckIn.open ? "Scan the tag on your door. No need to wait for the warden." : `Opens at ${formatClock(data.roomCheckIn.opensAt)}`}
            </span>
          </span>
        </button>
      )}

      <h2 className="mt-1 text-sm font-medium text-muted">Gate pass, if a guard asks or you come back late</h2>
      <section aria-label="Your QR pass" className="rounded-2xl bg-white p-4 text-black">
        {code ? (
          <div className="mx-auto aspect-square w-full max-w-80">
            <QrCode value={code} label={`NightPass code for ${student.name}`} />
          </div>
        ) : (
          <div className="grid aspect-square place-items-center text-center text-sm text-neutral-600">
            Reconnect to the internet to refresh your pass.
          </div>
        )}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (remaining / periodMs) * 100))}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" aria-hidden /> Official university pass
          </span>
          <span>New code in {Math.ceil(remaining / 1000)}s</span>
        </div>
      </section>

      <div className="flex flex-col gap-2 text-sm text-muted">
        {!online && (
          <p className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-warn ring-1 ring-warn/30">
            <WifiOff className="size-4 shrink-0" aria-hidden />
            No internet. Your pass will keep working for {preloadedMinutes} more minutes.
          </p>
        )}
        <p className="flex items-center gap-2">
          <Sun className="size-4 shrink-0" aria-hidden /> Turn your screen brightness up so it scans faster.
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> Show this screen, not a screenshot. The code changes every 15 seconds.
        </p>
      </div>

      {checkingIn && (
        <RoomCheckIn
          studentId={student.id}
          studentName={student.name}
          room={student.room}
          challenge={data.roomCheckIn.challenge}
          credentialId={data.roomCheckIn.credentialId}
          onClose={(done) => {
            setCheckingIn(false);
            if (done) setRefresh((n) => n + 1);
          }}
        />
      )}

      {data.history.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Previous nights</h2>
          <ul className="flex flex-col gap-2">
            {data.history.map((night) => (
              <li key={night.startsAt} className="flex items-center justify-between text-sm">
                <span className="text-muted">{formatDate(night.startsAt)}</span>
                {night.result ? (
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{formatClock(night.at!)}</span>
                    <ResultBadge result={night.result} />
                  </span>
                ) : (
                  <span className="text-xs text-bad">No check-in</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

/** Shown at the top of the screen while the warden is running an emergency headcount. */
function EmergencyCard({ emergency, onAnswered }: { emergency: NonNullable<StudentPassData["emergency"]>; onAnswered: () => void }) {
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);

  async function answer(status: "safe" | "help") {
    setBusy(true);
    try {
      const response = await fetch("/api/student/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("failed");
      setFailed(false);
      setChanging(false);
      onAnswered();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  const mine = changing ? null : emergency.mine;
  return (
    <section className="animate-result rounded-2xl bg-[#7f1d1d] p-4 text-white ring-2 ring-[#ef4444]" role="alert" aria-label="Emergency headcount">
      <div className="flex items-center gap-2 text-lg font-bold">
        <Siren className="size-6 shrink-0" aria-hidden /> Emergency headcount
      </div>
      <p className="mt-1 font-medium">{emergency.reason}</p>
      {mine ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2.5">
          <span className="flex items-center gap-2 font-semibold">
            {mine.status === "safe" ? <CheckCircle2 className="size-5 text-[#4ade80]" aria-hidden /> : <LifeBuoy className="size-5" aria-hidden />}
            {mine.status === "safe" ? `You're marked safe · ${formatClock(mine.at)}` : "Help is on the way. Stay where you are if it's safe."}
          </span>
          <button onClick={() => setChanging(true)} className="shrink-0 text-sm underline opacity-90">
            Change
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/85">Leave the building calmly and go to the assembly point. Then let the warden know you&apos;re safe.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => answer("safe")}
              disabled={busy}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-white text-lg font-bold text-[#7f1d1d] active:scale-[0.98]"
            >
              <CheckCircle2 className="size-5" aria-hidden /> I&apos;m safe
            </button>
            <button
              onClick={() => answer("help")}
              disabled={busy}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-black/30 text-lg font-bold ring-2 ring-white/70 active:scale-[0.98]"
            >
              <LifeBuoy className="size-5" aria-hidden /> I need help
            </button>
          </div>
        </>
      )}
      {failed && <p className="mt-2 text-sm">Couldn&apos;t send. Check your connection and try again, or tell a guard.</p>}
    </section>
  );
}
