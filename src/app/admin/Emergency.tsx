"use client";

import { CheckCircle2, Download, LifeBuoy, Siren } from "lucide-react";
import { useState } from "react";
import { Avatar, Card } from "@/components/ui";
import type { Headcount } from "@/lib/emergency";
import type { MapRoom } from "@/lib/queries";
import { formatClock } from "@/lib/time";
import { HostelMap } from "./HostelMap";

const REASONS = ["Fire alarm", "Evacuation drill", "Gas leak", "Power cut, building check"];
const button = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium";

async function post(body: unknown): Promise<boolean> {
  const response = await fetch("/api/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.ok;
}

/** The warden's button for starting a headcount, with a short choice of reason. */
export function StartHeadcount({ blocks, onStarted }: { blocks: string[]; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [block, setBlock] = useState("All blocks");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${button} h-9 bg-bad/10 text-bad ring-1 ring-bad/40 hover:bg-bad/15`}>
        <Siren className="size-4" aria-hidden /> Emergency headcount
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-bad/10 p-1.5 ring-1 ring-bad/40">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md bg-surface px-2 text-sm ring-1 ring-line" aria-label="What happened">
        {REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <select value={block} onChange={(e) => setBlock(e.target.value)} className="h-9 rounded-md bg-surface px-2 text-sm ring-1 ring-line" aria-label="Where">
        {["All blocks", ...blocks].map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
      <button
        onClick={async () => {
          setBusy(true);
          if (await post({ action: "start", reason: block === "All blocks" ? reason : `${reason}, ${block}` })) {
            setOpen(false);
            onStarted();
          }
          setBusy(false);
        }}
        disabled={busy}
        className={`${button} h-9 bg-bad text-white`}
      >
        Start headcount
      </button>
      <button onClick={() => setOpen(false)} className={`${button} h-9 text-muted`}>
        Cancel
      </button>
    </div>
  );
}

/** Shown at the top of the dashboard while a headcount is running. */
export function EmergencyPanel({ count, rooms, onChanged }: { count: Headcount; rooms: MapRoom[]; onChanged: () => void }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const { emergency, summary } = count;
  const first = count.people.filter((p) => p.status === "help" || (p.status === "unaccounted" && p.likelyInside));
  const pct = summary.students ? Math.round((summary.safe / summary.students) * 100) : 0;

  async function markSafe(studentId: string) {
    setSaving(studentId);
    await post({ action: "mark", studentId, status: "safe" });
    setSaving(null);
    onChanged();
  }

  async function download() {
    const response = await fetch(`/api/admin/export?kind=headcount&emergencyId=${emergency.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = "nightpass-headcount.csv";
    link.click();
  }

  return (
    <section className="mb-4 overflow-hidden rounded-xl border-2 border-bad bg-surface" aria-label="Emergency headcount">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bad px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <Siren className="size-6 animate-pulse" aria-hidden />
          <div>
            <div className="text-lg font-semibold">Emergency headcount: {emergency.reason}</div>
            <div className="text-sm opacity-90">
              Started {formatClock(emergency.startedAt)} by {emergency.startedBy}. Students were alerted on their phones.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={download} className={`${button} bg-white/15 hover:bg-white/25`}>
            <Download className="size-4" aria-hidden /> Download list
          </button>
          <button
            onClick={async () => {
              if (!confirmEnd) return setConfirmEnd(true);
              await post({ action: "end" });
              onChanged();
            }}
            className={`${button} bg-white font-semibold text-bad`}
          >
            {confirmEnd ? "Confirm: end headcount" : "End headcount"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <Stat value={summary.safe} label={`safe, out of ${summary.students}`} color="text-ok" />
        <Stat value={summary.help} label="need help" color="text-bad" />
        <Stat
          value={summary.unaccounted}
          label={`not accounted for. ${summary.likelyInside} of them checked in tonight, so they're probably still inside`}
          color="text-warn"
        />
        <div className="h-2 overflow-hidden rounded-full bg-surface-2 sm:col-span-3">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="flex max-h-[560px] flex-col p-4">
          <h2 className="text-sm font-medium">Check these rooms first</h2>
          <p className="text-xs text-muted">Students who asked for help, then students who checked in tonight and aren&apos;t safe yet.</p>
          {first.length === 0 ? (
            <p className="py-6 text-center text-sm text-ok">Everyone who was inside is accounted for.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line overflow-y-auto">
              {first.map((p) => (
                <li key={p.student.id} className="flex items-center gap-2.5 py-2">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">{p.student.room}</span>
                  <Avatar name={p.student.name} id={p.student.id} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.student.name}</div>
                    <div className={`text-xs ${p.status === "help" ? "font-medium text-bad" : "text-muted"}`}>
                      {p.status === "help" ? (
                        <span className="inline-flex items-center gap-1">
                          <LifeBuoy className="size-3" aria-hidden /> Asked for help · {formatClock(p.at!)}
                        </span>
                      ) : (
                        "Checked in tonight, not safe yet"
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => markSafe(p.student.id)}
                    disabled={saving === p.student.id}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-ok/10 px-2.5 text-xs font-semibold text-ok ring-1 ring-ok/40"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden /> Safe
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <HostelMap rooms={rooms} headcount={count} title="Where everyone is" />
      </div>
    </section>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-3xl font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
