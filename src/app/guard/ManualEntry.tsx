"use client";

import { CheckCircle2, Keyboard, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui";
import { formatClock } from "@/lib/time";
import type { Presence, RosterEntry } from "@/lib/verify";

const REASONS = ["Phone battery dead", "No phone with them", "QR won't scan", "Verified with ID card"];

interface ManualEntryProps {
  roster: RosterEntry[];
  findPresence: (id: string) => Presence | undefined;
  onManual: (student: RosterEntry, note: string) => void;
  onCode: (raw: string) => void;
  onClose: () => void;
}

/**
 * Fallback when a QR can't be scanned: search the roster (works offline), confirm the face against
 * the student record, pick a reason. Also accepts typed/pasted codes and USB/Bluetooth scanners.
 */
export function ManualEntry({ roster, findPresence, onManual, onCode, onClose }: ManualEntryProps) {
  const [mode, setMode] = useState<"search" | "code">("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [code, setCode] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return roster
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.room.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, roster]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Manual entry">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual entry</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-6" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
          {(["search", "code"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 text-sm font-medium ${mode === m ? "bg-surface-2 text-text ring-1 ring-line" : "text-muted"}`}
            >
              {m === "search" ? "Find student" : "Type / paste code"}
            </button>
          ))}
        </div>

        {mode === "code" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) onCode(code.trim());
            }}
          >
            <label className="text-sm text-muted" htmlFor="code">
              Works with handheld barcode scanners too: they type the code and press Enter.
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-brand">
              <Keyboard className="size-5 text-muted" aria-hidden />
              <input
                id="code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="NP1.…"
                className="h-12 flex-1 bg-transparent font-mono outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button className="h-12 rounded-xl bg-brand-strong font-semibold text-white disabled:opacity-50" disabled={!code.trim()}>
              Check code
            </button>
          </form>
        ) : selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <Avatar name={selected.name} id={selected.id} size={64} />
              <div>
                <div className="text-xl font-semibold">{selected.name}</div>
                <div className="font-mono text-sm text-muted">{selected.id}</div>
                <div className="text-muted">
                  {selected.hostel} · Room {selected.room}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted">Check the student&apos;s ID card before marking them present. Manual entries are flagged for the warden.</p>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-medium">Reason</legend>
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  aria-pressed={reason === r}
                  className={`rounded-full px-3 py-2 text-sm ring-1 ${reason === r ? "bg-brand/20 text-text ring-brand" : "bg-surface text-muted ring-line"}`}
                >
                  {r}
                </button>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSelected(null)} className="h-12 rounded-xl bg-surface-2 font-medium ring-1 ring-line">
                Back
              </button>
              <button onClick={() => onManual(selected, reason)} className="h-12 rounded-xl bg-ok font-semibold text-black">
                Mark present
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-brand">
              <Search className="size-5 text-muted" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, student ID or room"
                className="h-12 flex-1 bg-transparent outline-none"
                aria-label="Search students"
                autoComplete="off"
              />
            </div>
            <ul className="flex flex-col gap-2">
              {matches.map((s) => {
                const presence = findPresence(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelected(s)}
                      className="flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left ring-1 ring-line hover:ring-brand"
                    >
                      <Avatar name={s.name} id={s.id} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {s.id} · {s.room}
                        </span>
                      </span>
                      {presence && (
                        <span className="flex items-center gap-1 text-xs text-ok">
                          <CheckCircle2 className="size-4" aria-hidden /> In {formatClock(presence.atMs)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {query.trim().length >= 2 && matches.length === 0 && <li className="text-sm text-muted">No students match.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
