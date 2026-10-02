/**
 * Decides what a scan means. Pure and synchronous so the exact same rules run on the guard's
 * phone (instant, works offline) and on the server (authoritative, catches cross-gate duplicates).
 */
import {
  FUTURE_TOLERANCE_PERIODS,
  MAX_AGE_PERIODS,
  PERIOD_SECONDS,
  hasValidSignature,
  parsePass,
  periodAt,
} from "./pass";
import { formatClock } from "./time";

export type ScanResult = "valid" | "late" | "manual" | "duplicate" | "expired" | "invalid" | "unknown" | "absent";
/** How a record was made: gate scan, guard's manual entry, student's room check-in, or warden's rounds. */
export type ScanMethod = "qr" | "manual" | "self" | "round";

export const METHOD_LABELS: Record<ScanMethod, string> = {
  qr: "Gate scan",
  manual: "Manual entry",
  self: "Room check-in",
  round: "Warden's rounds",
};

/** Results that count the student as present for the roll call. */
export const PRESENT_RESULTS: readonly ScanResult[] = ["valid", "late", "manual"];
/** Results that need someone to follow up. */
export const FLAG_RESULTS: readonly ScanResult[] = ["late", "manual", "duplicate", "expired", "invalid", "unknown", "absent"];

export type Tone = "ok" | "warn" | "bad";

export const RESULT_META: Record<ScanResult, { label: string; tone: Tone }> = {
  valid: { label: "Checked in", tone: "ok" },
  late: { label: "Late", tone: "warn" },
  manual: { label: "Manual", tone: "warn" },
  duplicate: { label: "Duplicate", tone: "bad" },
  expired: { label: "Expired code", tone: "bad" },
  invalid: { label: "Rejected", tone: "bad" },
  unknown: { label: "Not on roster", tone: "bad" },
  absent: { label: "Not in room", tone: "bad" },
};

export interface RosterEntry {
  id: string;
  name: string;
  hostel: string;
  room: string;
}

export interface Presence {
  atMs: number;
  checkpoint: string;
}

export interface VerifyContext {
  nowMs: number;
  publicKey: Uint8Array;
  curfewAtMs: number | null;
  findStudent: (id: string) => RosterEntry | undefined;
  findPresence: (id: string) => Presence | undefined;
}

export interface Verdict {
  result: ScanResult;
  reason: string;
  /** The ID the code (or guard) claimed, even when it is not on the roster. */
  claimedId: string | null;
  student: RosterEntry | null;
}

export function verifyPass(raw: string, ctx: VerifyContext): Verdict {
  const pass = parsePass(raw);
  if (!pass) {
    return { result: "invalid", reason: "Not a NightPass code", claimedId: null, student: null };
  }

  const claimedId = pass.studentId;
  if (!hasValidSignature(pass, ctx.publicKey)) {
    return { result: "invalid", reason: "Security check failed: forged or altered code", claimedId, student: null };
  }

  const student = ctx.findStudent(claimedId) ?? null;
  const age = periodAt(ctx.nowMs) - pass.period;
  if (age > MAX_AGE_PERIODS) {
    const seconds = age * PERIOD_SECONDS;
    return {
      result: "expired",
      reason: `Code is ${humanAge(seconds)} old. Possible screenshot; ask for the live pass`,
      claimedId,
      student,
    };
  }
  if (age < -FUTURE_TOLERANCE_PERIODS) {
    return { result: "invalid", reason: "Code is from the future. Check the phone's clock", claimedId, student };
  }

  return checkPresence(claimedId, "qr", ctx);
}

export function verifyManual(studentId: string, note: string, ctx: VerifyContext): Verdict {
  return checkPresence(studentId, "manual", ctx, note);
}

function checkPresence(studentId: string, method: ScanMethod, ctx: VerifyContext, note = ""): Verdict {
  const student = ctx.findStudent(studentId) ?? null;
  if (!student) {
    return { result: "unknown", reason: "ID is not on the active roster", claimedId: studentId, student: null };
  }

  const presence = ctx.findPresence(studentId);
  if (presence) {
    return {
      result: "duplicate",
      reason: `Already checked in at ${formatClock(presence.atMs)} · ${presence.checkpoint}`,
      claimedId: studentId,
      student,
    };
  }

  if (method === "manual") {
    return { result: "manual", reason: `Manual entry: ${note || "no reason given"}`, claimedId: studentId, student };
  }

  if (ctx.curfewAtMs !== null && ctx.nowMs > ctx.curfewAtMs) {
    const minutes = Math.ceil((ctx.nowMs - ctx.curfewAtMs) / 60_000);
    return { result: "late", reason: `${minutes} min after curfew`, claimedId: studentId, student };
  }

  return { result: "valid", reason: "Checked in", claimedId: studentId, student };
}

function humanAge(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}
