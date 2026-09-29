"use client";

import { AlertTriangle, CheckCircle2, LogOut, Moon, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RESULT_META, type ScanResult, type Tone } from "@/lib/verify";

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-lg bg-[#16213a] text-[#93c5fd]">
        <Moon className="size-5" fill="currentColor" aria-hidden />
      </span>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">NightPass</div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ["#6d7ff5", "#0ea5e9", "#14b8a6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#eab308"];

export function Avatar({ name, id, size = 40 }: { name: string; id: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter((part) => /^[A-Za-z]/.test(part) && part !== "Al")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok ring-ok/30",
  warn: "bg-warn/15 text-warn ring-warn/30",
  bad: "bg-bad/15 text-bad ring-bad/30",
};

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "ok") return <CheckCircle2 className={className} aria-hidden />;
  if (tone === "warn") return <AlertTriangle className={className} aria-hidden />;
  return <XCircle className={className} aria-hidden />;
}

/** Status chip: colour + icon + text, so it reads correctly for colour-blind users too. */
export function ResultBadge({ result }: { result: ScanResult }) {
  const meta = RESULT_META[result];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${TONE_CLASSES[meta.tone]}`}>
      <ToneIcon tone={meta.tone} className="size-3.5" />
      {meta.label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace("/");
      }}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
      aria-label="Sign out"
    >
      <LogOut className="size-4" aria-hidden />
      {!compact && "Sign out"}
    </button>
  );
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // randomUUID needs a secure context; fall through.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** localStorage that never throws (private mode, blocked storage). */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable: the app keeps working from memory.
    }
  },
};
