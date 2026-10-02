"use client";

import { Check, DoorClosed, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui";
import type { RoundItem, Rounds as RoundsData, VisitOutcome } from "@/lib/rounds";
import { formatClock } from "@/lib/time";

/**
 * The warden's walking list for tonight: only the rooms that need a visit, in block and room
 * order, with the reason each one is on the list.
 */
export function Rounds() {
  const [data, setData] = useState<RoundsData | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/guard/rounds", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      setData(await response.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  async function record(item: RoundItem, outcome: VisitOutcome) {
    setSaving(item.student.id);
    try {
      const response = await fetch("/api/guard/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: item.student.id, outcome }),
      });
      if (!response.ok) throw new Error("failed");
      setData(await response.json());
      setError(false);
    } catch {
      setError(true);
    }
    setSaving(null);
  }

  if (!data) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-muted">
        {error ? "Rounds need a connection. Trying again…" : <><Loader2 className="size-5 animate-spin" aria-hidden /> Loading tonight&apos;s rounds…</>}
      </p>
    );
  }

  const { summary, items } = data;
  const left = summary.toVisit - summary.visited;
  const blocks = [...new Set(items.map((i) => i.student.hostel))];

  return (
    <section aria-label="Room rounds" className="flex flex-col gap-3">
      <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-3xl font-semibold tabular-nums">{summary.toVisit}</span>
            <span className="ml-2 text-muted">rooms to visit</span>
          </div>
          <span className="text-sm text-muted">not {summary.students}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {summary.noVisitNeeded} students are already confirmed. {summary.missing} have no check-in, {summary.spotChecks} are spot checks.
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${summary.toVisit ? (summary.visited / summary.toVisit) * 100 : 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {left === 0 ? "All rooms on the list are done." : `${summary.visited} done, ${left} to go`}
          {!data.curfewPassed && ` · curfew is at ${formatClock(data.rollCall.curfewAt)}, so this list will still shrink`}
        </p>
      </div>

      {error && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn ring-1 ring-warn/30">Connection problem. Your last tap may not be saved.</p>}

      {blocks.map((block) => (
        <div key={block} className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-medium text-muted">{block}</h3>
          {items
            .filter((i) => i.student.hostel === block)
            .map((item) => (
              <RoundCard key={item.student.id} item={item} busy={saving === item.student.id} onRecord={(outcome) => record(item, outcome)} />
            ))}
        </div>
      ))}
    </section>
  );
}

function RoundCard({ item, busy, onRecord }: { item: RoundItem; busy: boolean; onRecord: (outcome: VisitOutcome) => void }) {
  const { student, visit } = item;
  return (
    <div
      className={`rounded-2xl bg-surface p-3 ring-1 ${
        visit ? (visit.outcome === "present" ? "ring-ok/40" : "ring-bad/50") : item.kind === "missing" ? "ring-line" : "ring-warn/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-12 min-w-16 shrink-0 place-items-center rounded-xl bg-surface-2 px-2 text-base font-semibold tabular-nums">
          {student.room}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Avatar name={student.name} id={student.id} size={22} />
            <span className="truncate font-medium">{student.name}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {item.kind === "spot" ? "Spot check: " : ""}
            {item.reasons.join(" · ")}
            {item.kind === "spot" && item.checkedInAt && ` · checked in ${formatClock(item.checkedInAt)}`}
          </div>
        </div>
        {busy && <Loader2 className="size-5 shrink-0 animate-spin text-muted" aria-hidden />}
      </div>

      {visit ? (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className={`flex items-center gap-1.5 font-medium ${visit.outcome === "present" ? "text-ok" : "text-bad"}`}>
            {visit.outcome === "present" ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
            {visit.outcome === "present" ? "In room" : "Not in room"} · {formatClock(visit.at)}
          </span>
          <button
            onClick={() => onRecord(visit.outcome === "present" ? "absent" : "present")}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => onRecord("present")}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ok/15 font-semibold text-ok ring-1 ring-ok/40 active:scale-[0.98]"
          >
            <Check className="size-5" aria-hidden /> In room
          </button>
          <button
            onClick={() => onRecord("absent")}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-bad/15 font-semibold text-bad ring-1 ring-bad/40 active:scale-[0.98]"
          >
            <DoorClosed className="size-5" aria-hidden /> Not in room
          </button>
        </div>
      )}
    </div>
  );
}
