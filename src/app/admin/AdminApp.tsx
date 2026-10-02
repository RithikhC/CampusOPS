"use client";

import { AlertTriangle, CircleCheck, Clock, DoorOpen, ScanLine, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BASE_PATH, Card, LogoutButton, Logo } from "@/components/ui";
import type { AdminOverview } from "@/lib/queries";
import { formatClock, formatDate } from "@/lib/time";
import { FeedTab, FlagsTab, MissingTab, RecordsTab, RollCallTab, RosterTab, RoundsTab } from "./tabs";

type Tab = "feed" | "rounds" | "missing" | "flags" | "records" | "roster" | "rollcall";

export function AdminApp({ adminName, demoMode }: { adminName: string; demoMode: boolean }) {
  const [rollCallId, setRollCallId] = useState<number | null>(null);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/overview${rollCallId ? `?rollCallId=${rollCallId}` : ""}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace(`${BASE_PATH}/`);
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error ?? "Failed to load");
      setData(await response.json());
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [rollCallId]);

  // Live: refresh every few seconds while the tab is visible.
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  if (!data) {
    return <main className="theme-light grid min-h-dvh place-items-center text-muted">{error ?? "Loading dashboard…"}</main>;
  }

  const { stats, rollCall } = data;
  const pct = stats.expected ? Math.round((stats.present / stats.expected) * 100) : 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "feed", label: "Recent scans" },
    { id: "missing", label: "Not back yet", count: stats.missing },
    { id: "rounds", label: "Room rounds", count: data.rounds.summary.toVisit },
    { id: "flags", label: "Needs review", count: stats.flagsOpen },
    { id: "records", label: "Search & export" },
    { id: "roster", label: "Students" },
    { id: "rollcall", label: "Settings" },
  ];

  return (
    <div className="theme-light min-h-dvh">
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Logo subtitle={`Warden dashboard, ${adminName}`} />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rollCallId ?? ""}
            onChange={(e) => setRollCallId(e.target.value ? Number(e.target.value) : null)}
            className="h-9 rounded-lg bg-surface px-2 text-sm ring-1 ring-line outline-none"
            aria-label="Which night"
          >
            <option value="">Tonight</option>
            {data.rollCalls.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.name}
              </option>
            ))}
          </select>
          <Link
            href="/guard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm ring-1 ring-line hover:ring-brand"
          >
            <ScanLine className="size-4" aria-hidden /> Open scanner
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{rollCall.name}</h1>
        {data.isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-medium text-ok ring-1 ring-ok/30">
            <span className="size-1.5 animate-pulse rounded-full bg-ok" /> Live
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted ring-1 ring-line">Closed</span>
        )}
        <span className="text-sm text-muted">Curfew {formatClock(rollCall.curfewAt)}</span>
        <span className="text-sm text-muted sm:ml-auto">
          {error ? <span className="text-warn">Connection lost, retrying…</span> : updatedAt && `Updated ${formatClock(updatedAt, true)}`}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
        <Kpi icon={<CircleCheck className="size-5 text-ok" />} label="Checked in" value={stats.present} sub={`out of ${stats.expected} (${pct}%)`}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
          </div>
        </Kpi>
        <Kpi icon={<UserX className="size-5 text-brand" />} label="Not back yet" value={stats.missing} sub="tap to see the list" onClick={() => setTab("missing")} />
        <Kpi icon={<Clock className="size-5 text-warn" />} label="Late" value={stats.late} sub="came in after curfew" />
        <Kpi icon={<AlertTriangle className="size-5 text-warn" />} label="Needs review" value={stats.flagsOpen} sub="tap to review" onClick={() => setTab("flags")} />
        <Kpi
          icon={<DoorOpen className="size-5 text-brand" />}
          label="Rooms to visit"
          value={data.rounds.summary.toVisit}
          sub={`instead of all ${data.rounds.summary.students}`}
          onClick={() => setTab("rounds")}
        />
      </section>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
        <span className="text-muted">How the {stats.present} checked-in students were confirmed:</span>
        <span>
          <strong className="tabular-nums">{data.verifiedBy.self}</strong> from their room
        </span>
        <span>
          <strong className="tabular-nums">{data.verifiedBy.qr}</strong> scanned at a gate
        </span>
        <span>
          <strong className="tabular-nums">{data.verifiedBy.round}</strong> seen on rounds
        </span>
        <span>
          <strong className="tabular-nums">{data.verifiedBy.manual}</strong> entered by a guard
        </span>
      </p>

      <section className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="text-sm font-medium">By hostel</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {data.byHostel.map((h) => {
              const p = h.expected ? Math.round((h.present / h.expected) * 100) : 0;
              return (
                <li key={h.hostel}>
                  <div className="flex justify-between text-sm">
                    <span>{h.hostel}</span>
                    <span className="tabular-nums text-muted">
                      {h.present} of {h.expected}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${p}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <ArrivalsChart arrivals={data.arrivals} curfewAt={rollCall.curfewAt} />
        <TrendChart trend={data.trend} expected={stats.expected} currentId={rollCall.id} />
      </section>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
              tab === t.id ? "border-brand text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${t.count ? "bg-surface-2 text-text" : "text-muted"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "feed" && <FeedTab records={data.feed} />}
        {tab === "missing" && <MissingTab missing={data.missing} rollCallId={rollCall.id} />}
        {tab === "rounds" && <RoundsTab rounds={data.rounds} />}
        {tab === "flags" && <FlagsTab flags={data.flags} onResolved={load} />}
        {tab === "records" && <RecordsTab rollCalls={data.rollCalls} defaultRollCallId={rollCall.id} hostels={data.byHostel.map((h) => h.hostel)} />}
        {tab === "roster" && <RosterTab onImported={load} />}
        {tab === "rollcall" && (
          <RollCallTab
            key={`${rollCall.id}-${rollCall.curfewAt}`}
            rollCall={rollCall}
            isLive={data.isLive}
            demoMode={demoMode}
            onChanged={() => {
              setRollCallId(null);
              void load();
            }}
          />
        )}
      </div>
    </main>
    </div>
  );
}

function Kpi({
  icon, label, value, sub, onClick, children,
}: { icon: React.ReactNode; label: string; value: number; sub: string; onClick?: () => void; children?: React.ReactNode }) {
  const content = (
    <>
      <div className="flex items-center justify-between text-sm text-muted">
        {label}
        {icon}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
      {children}
    </>
  );
  const className = "flex flex-col justify-start rounded-xl border border-line bg-surface p-4 text-left";
  return onClick ? (
    <button onClick={onClick} className={`${className} transition hover:border-brand`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function ArrivalsChart({ arrivals, curfewAt }: { arrivals: AdminOverview["arrivals"]; curfewAt: string }) {
  const max = Math.max(1, ...arrivals.map((a) => a.count));
  const curfew = Date.parse(curfewAt);
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium">Check-ins every 15 minutes</h2>
      {arrivals.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No check-ins yet.</p>
      ) : (
        <div className="mt-3 flex h-32 items-end gap-1" role="img" aria-label="Check-ins per 15 minutes">
          {arrivals.map((a) => {
            const late = Date.parse(a.at) >= curfew;
            return (
              <div key={a.at} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={`rounded-t ${late ? "bg-warn" : "bg-brand"} min-h-0.5`}
                  style={{ height: `${(a.count / max) * 100}%` }}
                  title={`${formatClock(a.at)}: ${a.count}`}
                />
              </div>
            );
          })}
        </div>
      )}
      {arrivals.length > 0 && (
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{formatClock(arrivals[0].at)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-brand" /> before curfew</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-warn" /> after curfew</span>
          </span>
          <span>{formatClock(arrivals.at(-1)!.at)}</span>
        </div>
      )}
    </Card>
  );
}

function TrendChart({ trend, expected, currentId }: { trend: AdminOverview["trend"]; expected: number; currentId: number }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium">Attendance, last {trend.length} nights</h2>
      <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label="Attendance by night">
        {trend.map((t) => {
          const pct = expected ? Math.round((t.present / expected) * 100) : 0;
          return (
            <div key={t.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] tabular-nums text-muted">{pct}%</span>
              <div
                className={`w-full rounded-t ${t.id === currentId ? "bg-ok" : "bg-surface-2 ring-1 ring-line"}`}
                style={{ height: `${pct * 0.8}%` }}
                title={`${t.name}: ${t.present} present, ${t.late} late`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
        {trend.map((t) => (
          <span key={t.id} className="flex-1 truncate text-center">
            {formatDate(t.startsAt).split(" ")[0]}
          </span>
        ))}
      </div>
    </Card>
  );
}
