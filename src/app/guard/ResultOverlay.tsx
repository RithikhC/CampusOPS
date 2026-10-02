"use client";

import { useEffect } from "react";
import { Avatar, ToneIcon } from "@/components/ui";
import { RESULT_META, type Verdict } from "@/lib/verify";

const TITLES: Record<Verdict["result"], string> = {
  valid: "Checked in",
  late: "Late arrival",
  manual: "Marked present",
  duplicate: "Already scanned",
  expired: "Expired code",
  invalid: "Invalid code",
  unknown: "Not on roster",
  absent: "Not in room",
};

const BACKGROUND = { ok: "bg-[#0f7a3a]", warn: "bg-[#a36200]", bad: "bg-[#b42323]" };
/** Green clears fast so the queue keeps moving; problems stay up long enough to act on. */
const DISMISS_MS = { ok: 1300, warn: 2600, bad: 4500 };

export function ResultOverlay({ verdict, onDismiss }: { verdict: Verdict; onDismiss: () => void }) {
  const tone = RESULT_META[verdict.result].tone;

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, DISMISS_MS[tone]);
    return () => window.clearTimeout(timer);
  }, [verdict, tone, onDismiss]);

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`animate-result fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 px-6 text-center text-white ${BACKGROUND[tone]}`}
      role="alert"
      aria-live="assertive"
    >
      <ToneIcon tone={tone} className="size-24 drop-shadow" />
      <div className="text-4xl font-bold tracking-tight uppercase">{TITLES[verdict.result]}</div>

      {verdict.student ? (
        <div className="flex flex-col items-center gap-2">
          <Avatar name={verdict.student.name} id={verdict.student.id} size={84} />
          <div className="text-3xl font-semibold">{verdict.student.name}</div>
          <div className="font-mono text-lg opacity-90">{verdict.student.id}</div>
          <div className="text-xl opacity-90">
            {verdict.student.hostel} · Room {verdict.student.room}
          </div>
        </div>
      ) : (
        verdict.claimedId && <div className="font-mono text-xl opacity-90">{verdict.claimedId}</div>
      )}

      {verdict.result !== "valid" && (
        <div className="max-w-sm rounded-xl bg-black/25 px-4 py-2 text-lg">{verdict.reason}</div>
      )}
      <div className="absolute bottom-8 text-sm opacity-70">Tap to continue</div>
    </button>
  );
}
