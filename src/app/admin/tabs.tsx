"use client";

import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, RotateCcw, Search, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Card, ResultBadge } from "@/components/ui";
import type { MissingStudent, ScanRecord } from "@/lib/queries";
import type { RollCall } from "@/lib/rollcall";
import { formatClock, formatDate, toTimeInput } from "@/lib/time";
import { RESULT_META } from "@/lib/verify";

const input = "h-10 rounded-lg bg-surface px-3 text-sm ring-1 ring-line outline-none focus:ring-brand";
const button = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium";

// ------------------------------------------------------------------ shared table

function RecordsTable({ records, showNight = false, empty }: { records: ScanRecord[]; showNight?: boolean; empty: string }) {
  if (records.length === 0) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Time</th>
            <th className="px-4 py-2.5 font-medium">Student</th>
            <th className="px-4 py-2.5 font-medium">Hostel</th>
            <th className="px-4 py-2.5 font-medium">Checkpoint</th>
            <th className="px-4 py-2.5 font-medium">Result</th>
            <th className="px-4 py-2.5 font-medium">Detail</th>
            <th className="px-4 py-2.5 font-medium">Scanned by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {records.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                {formatClock(r.scannedAt, true)}
                {showNight && <div className="text-xs text-muted">{formatDate(r.scannedAt)}</div>}
              </td>
              <td className="px-4 py-2.5">
                {r.studentName ? (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.studentName} id={r.studentId ?? ""} size={28} />
                    <div>
                      <div className="font-medium">{r.studentName}</div>
                      <div className="font-mono text-xs text-muted">{r.studentId}</div>
                    </div>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-muted">{r.claimedId ?? "unreadable"}</span>
                )}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-muted">{r.hostel ? `${r.hostel} · ${r.room}` : "—"}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                {r.checkpoint ?? "—"}
                {r.method === "manual" && <div className="text-xs text-muted">manual entry</div>}
              </td>
              <td className="px-4 py-2.5">
                <ResultBadge result={r.result} />
                {r.resolvedAt && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <CheckCircle2 className="size-3" aria-hidden /> resolved
                  </div>
                )}
              </td>
              <td className="max-w-72 px-4 py-2.5 text-muted">
                {r.reason}
                {r.resolutionNote && <div className="mt-1 text-xs italic">“{r.resolutionNote}” · {r.resolvedBy}</div>}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                {r.scannedBy ?? "—"}
                {r.offline && (
                  <div className="flex items-center gap-1 text-xs" title="Scanned offline, synced later">
                    <WifiOff className="size-3" aria-hidden /> synced later
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ------------------------------------------------------------------ tabs

export function FeedTab({ records }: { records: ScanRecord[] }) {
  return <RecordsTable records={records} empty="No scans yet tonight." />;
}

export function MissingTab({ missing, rollCallId }: { missing: MissingStudent[]; rollCallId: number }) {
  const [query, setQuery] = useState("");
  const [hostel, setHostel] = useState("");
  const hostels = useMemo(() => [...new Set(missing.map((m) => m.hostel))].sort(), [missing]);
  const shown = missing.filter(
    (m) =>
      (!hostel || m.hostel === hostel) &&
      (!query || `${m.name} ${m.id} ${m.room}`.toLowerCase().includes(query.toLowerCase())),
  );
  const attempts = missing.filter((m) => m.lastAttempt).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, ID or room" />
        <select value={hostel} onChange={(e) => setHostel(e.target.value)} className={input} aria-label="Hostel">
          <option value="">All hostels</option>
          {hostels.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <a href={`/api/admin/export?kind=missing&rollCallId=${rollCallId}`} className={`${button} bg-surface-2 ring-1 ring-line hover:ring-brand`}>
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
        {attempts > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-warn">
            <AlertTriangle className="size-4" aria-hidden />
            {attempts} of them had a scan rejected tonight. Check these first.
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Everyone is back.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Hostel · Room</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Scans tonight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((m) => (
                <tr key={m.id} className={m.lastAttempt ? "bg-warn/5" : undefined}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} id={m.id} size={28} />
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="font-mono text-xs text-muted">{m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {m.hostel} · {m.room}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{m.email}</td>
                  <td className="px-4 py-2.5">
                    {m.lastAttempt ? (
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <ResultBadge result={m.lastAttempt.result} />
                          <span className="text-xs text-muted">{formatClock(m.lastAttempt.at)}</span>
                        </span>
                        <span className="text-xs text-warn">{m.lastAttempt.reason}</span>
                      </div>
                    ) : (
                      <span className="text-muted">Not scanned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const QUICK_NOTES = ["Verified with student in person", "Warden informed", "Scanned in error", "Parent/guardian contacted"];

export function FlagsTab({ flags, onResolved }: { flags: ScanRecord[]; onResolved: () => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve(id: number) {
    setBusy(true);
    await fetch(`/api/admin/flags/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    setOpenId(null);
    setNote("");
    onResolved();
  }

  if (flags.length === 0) return <p className="py-8 text-center text-sm text-muted">Nothing to review right now.</p>;

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {flags.map((f) => {
        const tone = RESULT_META[f.result].tone;
        return (
          <li key={f.id}>
            <Card className={`p-4 ${tone === "bad" ? "border-bad/40" : "border-warn/40"}`}>
              <div className="flex items-start gap-3">
                {f.studentName ? (
                  <Avatar name={f.studentName} id={f.studentId ?? ""} size={40} />
                ) : (
                  <span className="grid size-10 place-items-center rounded-full bg-surface-2">
                    <AlertTriangle className="size-5 text-bad" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.studentName ?? f.claimedId ?? "Unreadable code"}</span>
                    <ResultBadge result={f.result} />
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {formatClock(f.scannedAt)} · {f.checkpoint ?? "—"} · {f.scannedBy ?? "—"}
                    {f.hostel && ` · ${f.hostel} ${f.room}`}
                  </div>
                  <p className="mt-2 text-sm">{f.reason}</p>
                </div>
              </div>
              {openId === f.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_NOTES.map((n) => (
                      <button key={n} onClick={() => setNote(n)} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs ring-1 ring-line hover:ring-brand">
                        {n}
                      </button>
                    ))}
                  </div>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do? (optional)" className={input} autoFocus />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setOpenId(null)} className={`${button} text-muted`}>
                      Cancel
                    </button>
                    <button onClick={() => resolve(f.id)} disabled={busy} className={`${button} bg-brand-strong text-white`}>
                      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Mark resolved
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setOpenId(f.id);
                      setNote("");
                    }}
                    className={`${button} bg-surface-2 ring-1 ring-line hover:ring-brand`}
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Resolve
                  </button>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function RecordsTab({ rollCalls, defaultRollCallId, hostels }: { rollCalls: RollCall[]; defaultRollCallId: number; hostels: string[] }) {
  const [filters, setFilters] = useState({ q: "", result: "", hostel: "", rollCallId: String(defaultRollCallId) });
  const [records, setRecords] = useState<ScanRecord[] | null>(null);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  const search = useCallback(async () => {
    const response = await fetch(`/api/admin/records?${query}`, { cache: "no-store" });
    if (response.ok) setRecords((await response.json()).records);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(search, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const set = (key: keyof typeof filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={filters.q} onChange={set("q")} placeholder="Search name, ID or room" />
        <select value={filters.rollCallId} onChange={(e) => set("rollCallId")(e.target.value)} className={input} aria-label="Night">
          <option value="">All nights</option>
          {rollCalls.map((rc) => (
            <option key={rc.id} value={rc.id}>
              {rc.name}
            </option>
          ))}
        </select>
        <select value={filters.result} onChange={(e) => set("result")(e.target.value)} className={input} aria-label="Result">
          <option value="">All results</option>
          <option value="present">Checked in (any)</option>
          <option value="flagged">Flagged (any)</option>
          <option value="open">Still needs review</option>
          {Object.entries(RESULT_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        <select value={filters.hostel} onChange={(e) => set("hostel")(e.target.value)} className={input} aria-label="Hostel">
          <option value="">All hostels</option>
          {hostels.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <a href={`/api/admin/export?kind=records&${query}`} className={`${button} bg-brand-strong text-white`}>
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
        {records && <span className="text-sm text-muted">{records.length === 300 ? "Showing latest 300" : `${records.length} records`}</span>}
      </div>
      {records ? (
        <RecordsTable records={records} showNight={!filters.rollCallId} empty="No records match these filters." />
      ) : (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      )}
    </div>
  );
}

interface RosterStudent {
  id: string;
  name: string;
  email: string;
  hostel: string;
  room: string;
  active: boolean;
}

const TEMPLATE = "id,name,email,hostel,room,active\n2025A7PS0001U,New Student,new.student@campus.demo,A-Block,A-101,true\n";

export function RosterTab({ onImported }: { onImported: () => void }) {
  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ added: number; updated: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/roster", { cache: "no-store" });
    if (response.ok) setStudents((await response.json()).students);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    const response = await fetch("/api/admin/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: await file.text() }),
    });
    const body = await response.json();
    setResult(response.ok ? body : { added: 0, updated: 0, errors: [body.error] });
    setBusy(false);
    void load();
    onImported();
  }

  const shown = (students ?? []).filter((s) => !query || `${s.name} ${s.id} ${s.room}`.toLowerCase().includes(query.toLowerCase()));
  const byHostel = Object.entries(
    (students ?? []).reduce<Record<string, number>>((acc, s) => {
      if (s.active) acc[s.hostel] = (acc[s.hostel] ?? 0) + 1;
      return acc;
    }, {}),
  );

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-60 flex-1">
          <h2 className="font-medium">Update the student list</h2>
          <p className="text-sm text-muted">
            Upload a CSV exported from the student records system (columns: id, name, email, hostel, room, active). Existing students are updated. Students marked inactive can no longer check in.
          </p>
        </div>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="nightpass-roster-template.csv" className={`${button} text-muted hover:text-text`}>
          <Download className="size-4" aria-hidden /> Template
        </a>
        <label className={`${button} cursor-pointer bg-brand-strong text-white`}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
          Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {result && (
          <div className="w-full text-sm">
            <span className="text-ok">
              {result.added} added, {result.updated} updated.
            </span>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-bad">
                {result.errors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search roster" />
        {byHostel.map(([hostel, count]) => (
          <span key={hostel} className="rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line">
            {hostel}: <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Hostel · Room</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.slice(0, 200).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} id={s.id} size={26} />
                    <span className="font-medium">{s.name}</span>
                    <span className="font-mono text-xs text-muted">{s.id}</span>
                  </div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {s.hostel} · {s.room}
                </td>
                <td className="px-4 py-2 text-muted">{s.email}</td>
                <td className="px-4 py-2">{s.active ? <span className="text-ok">Active</span> : <span className="text-muted">Inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function RollCallTab({ rollCall, isLive, demoMode, onChanged }: { rollCall: RollCall; isLive: boolean; demoMode: boolean; onChanged: () => void }) {
  const [curfew, setCurfew] = useState(() => toTimeInput(Date.parse(rollCall.curfewAt)));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(url: string, body: unknown, label: string, done: string) {
    setBusy(label);
    setMessage(null);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    setMessage(response.ok ? done : (await response.json()).error ?? "Something went wrong");
    if (response.ok) onChanged();
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-medium">Curfew time</h2>
        <p className="mt-1 text-sm text-muted">Anyone who checks in after this time is marked late.</p>
        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/admin/rollcall", { action: "curfew", rollCallId: rollCall.id, time: curfew }, "curfew", `Curfew set to ${curfew}`);
          }}
        >
          <input type="time" value={curfew} onChange={(e) => setCurfew(e.target.value)} className={input} aria-label="Curfew time" required />
          <button className={`${button} bg-brand-strong text-white`} disabled={busy !== null}>
            {busy === "curfew" && <Loader2 className="size-4 animate-spin" aria-hidden />} Save
          </button>
        </form>
        <dl className="mt-5 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Window opens</dt>
          <dd>{formatDate(rollCall.startsAt)}, {formatClock(rollCall.startsAt)}</dd>
          <dt className="text-muted">Window closes</dt>
          <dd>{formatDate(rollCall.endsAt)}, {formatClock(rollCall.endsAt)}</dd>
          <dt className="text-muted">Status</dt>
          <dd>{isLive ? "Live" : "Closed"}</dd>
        </dl>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-medium">Start a new roll call now</h2>
          <p className="mt-1 text-sm text-muted">
            Ends the current roll call and starts a new one, for example a second check later in the night. The scanners switch over by themselves.
          </p>
          <button
            onClick={() => post("/api/admin/rollcall", { action: "new" }, "new", "New roll call started")}
            className={`${button} mt-3 bg-surface-2 ring-1 ring-line hover:ring-brand`}
            disabled={busy !== null}
          >
            {busy === "new" && <Loader2 className="size-4 animate-spin" aria-hidden />} Start new roll call
          </button>
        </div>
        {demoMode && (
          <div className="border-t border-line pt-4">
            <h2 className="font-medium">Demo data</h2>
            <p className="mt-1 text-sm text-muted">Puts the sample students and a week of history back, with tonight&apos;s roll call starting now. Use this before a demo.</p>
            <button
              onClick={() => {
                if (window.confirm("Reset all demo data?")) void post("/api/admin/reset", {}, "reset", "Demo data reset");
              }}
              className={`${button} mt-3 bg-bad/15 text-bad ring-1 ring-bad/30`}
              disabled={busy !== null}
            >
              {busy === "reset" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />} Reset demo data
            </button>
          </div>
        )}
        {message && <p className="text-sm text-ok">{message}</p>}
      </Card>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg bg-surface px-3 ring-1 ring-line focus-within:ring-brand sm:flex-none">
      <Search className="size-4 text-muted" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" aria-label={placeholder} />
    </label>
  );
}
