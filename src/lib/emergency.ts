/**
 * Emergency headcount (fire alarm, evacuation, any night-time incident).
 *
 * The warden starts a headcount. Students mark themselves safe (or ask for help) on their phone,
 * guards scan passes at the assembly point, and staff can mark people safe by hand. What makes
 * it useful is tonight's attendance: a student who checked in and isn't safe yet is probably
 * still in their room, so responders know which rooms to check first.
 */
import { config } from "./config";
import { toCsv } from "./csv";
import type { Db } from "./dbcore";
import { MAX_AGE_PERIODS, fromHex, hasValidSignature, parsePass, periodAt } from "./pass";
import { findActiveRollCall } from "./rollcall";
import type { SessionUser } from "./session";
import { formatClock } from "./time";
import { PRESENT_RESULTS, type RosterEntry } from "./verify";

export type SafetyStatus = "safe" | "help";
/** How a response was recorded: the student's own phone, a pass scanned at the assembly point, or staff by hand. */
export type SafetyMethod = "self" | "scan" | "staff";

export interface Emergency {
  id: number;
  reason: string;
  startedAt: string;
  startedBy: string;
  endedAt: string | null;
}

export interface HeadcountPerson {
  student: RosterEntry;
  status: SafetyStatus | "unaccounted";
  /** Checked in tonight, so probably still inside the building. */
  likelyInside: boolean;
  at: string | null;
  method: SafetyMethod | null;
  by: string | null;
}

export interface Headcount {
  emergency: Emergency;
  summary: { students: number; safe: number; help: number; unaccounted: number; likelyInside: number };
  /** Needs help first, then likely still inside (by block and room), then the rest, then safe. */
  people: HeadcountPerson[];
}

const PRESENT_SQL = `('${PRESENT_RESULTS.join("','")}')`;
const publicKey = fromHex(config.qrPublicKeyHex);
const naturalOrder = new Intl.Collator("en", { numeric: true });

interface EmergencyRow {
  id: number;
  reason: string;
  started_at: Date;
  started_by: string;
  ended_at: Date | null;
}

function toEmergency(row: EmergencyRow): Emergency {
  return {
    id: row.id,
    reason: row.reason,
    startedAt: new Date(row.started_at).toISOString(),
    startedBy: row.started_by,
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
  };
}

const EMERGENCY_SELECT = `select e.id, e.reason, e.started_at, coalesce(sf.name, e.started_by) as started_by, e.ended_at
                            from emergencies e left join staff sf on sf.id = e.started_by`;

export async function activeEmergency(db: Db): Promise<Emergency | null> {
  const [row] = await db.query<EmergencyRow>(`${EMERGENCY_SELECT} where e.ended_at is null order by e.started_at desc limit 1`);
  return row ? toEmergency(row) : null;
}

export async function lastEmergency(db: Db): Promise<Emergency | null> {
  const [row] = await db.query<EmergencyRow>(`${EMERGENCY_SELECT} order by e.started_at desc limit 1`);
  return row ? toEmergency(row) : null;
}

export async function startEmergency(db: Db, user: SessionUser, reason: string, nowMs = Date.now()): Promise<Emergency> {
  const active = await activeEmergency(db);
  if (active) return active;
  await db.query(`insert into emergencies (reason, started_at, started_by) values ($1, $2, $3)`, [
    reason.trim().slice(0, 120) || "Emergency headcount",
    new Date(nowMs),
    user.id,
  ]);
  await db.query(`insert into audit_log (actor, action, detail) values ($1, 'start_emergency', $2)`, [user.id, reason]);
  return (await activeEmergency(db))!;
}

export async function endEmergency(db: Db, user: SessionUser, nowMs = Date.now()): Promise<boolean> {
  const active = await activeEmergency(db);
  if (!active) return false;
  const count = await headcount(db, active.id);
  await db.query(`update emergencies set ended_at = $2, ended_by = $3 where id = $1`, [active.id, new Date(nowMs), user.id]);
  await db.query(`insert into audit_log (actor, action, detail) values ($1, 'end_emergency', $2)`, [
    user.id,
    `${active.reason}: ${count?.summary.safe ?? 0} safe, ${count?.summary.help ?? 0} needed help, ${count?.summary.unaccounted ?? 0} unaccounted`,
  ]);
  return true;
}

/** Records one person's status. The latest report wins (someone who asked for help can later be marked safe). */
export async function markSafety(
  db: Db,
  emergencyId: number,
  studentId: string,
  status: SafetyStatus,
  method: SafetyMethod,
  recordedBy: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const [student] = await db.query(`select 1 from students where id = $1 and active`, [studentId]);
  if (!student) return false;
  await db.query(
    `insert into emergency_responses (emergency_id, student_id, status, method, recorded_by, at) values ($1, $2, $3, $4, $5, $6)
     on conflict (emergency_id, student_id) do update
       set status = excluded.status, method = excluded.method, recorded_by = excluded.recorded_by, at = excluded.at`,
    [emergencyId, studentId, status, method, recordedBy, new Date(nowMs)],
  );
  return true;
}

export interface AssemblyScan {
  ok: boolean;
  student: RosterEntry | null;
  message: string;
}

/**
 * A guard scans a student's pass at the assembly point. Same signature and age checks as at the
 * gate, but it marks the student safe instead of checking them in.
 */
export async function scanAtAssembly(db: Db, user: SessionUser, raw: string, nowMs = Date.now()): Promise<AssemblyScan> {
  const emergency = await activeEmergency(db);
  if (!emergency) return { ok: false, student: null, message: "There is no headcount running." };
  const pass = parsePass(raw);
  if (!pass || !hasValidSignature(pass, publicKey)) return { ok: false, student: null, message: "Not a NightPass pass." };
  if (periodAt(nowMs) - pass.period > MAX_AGE_PERIODS) {
    return { ok: false, student: null, message: "Old code, probably a screenshot. Ask for the live pass." };
  }
  const [student] = await db.query<RosterEntry>(`select id, name, hostel, room from students where id = $1 and active`, [pass.studentId]);
  if (!student) return { ok: false, student: null, message: "Not on the student list." };
  await markSafety(db, emergency.id, student.id, "safe", "scan", user.id, nowMs);
  return { ok: true, student, message: `Safe at ${formatClock(nowMs)}` };
}

export async function headcount(db: Db, emergencyId?: number): Promise<Headcount | null> {
  const emergency = emergencyId
    ? await db.query<EmergencyRow>(`${EMERGENCY_SELECT} where e.id = $1`, [emergencyId]).then(([row]) => (row ? toEmergency(row) : null))
    : await activeEmergency(db);
  if (!emergency) return null;

  // "Inside" means checked in on the night the emergency happened.
  const rollCall = await findActiveRollCall(db, Date.parse(emergency.startedAt));
  const rows = await db.query<{
    id: string;
    name: string;
    hostel: string;
    room: string;
    checked_in: boolean;
    status: SafetyStatus | null;
    method: SafetyMethod | null;
    at: Date | null;
    by: string | null;
  }>(
    `select st.id, st.name, st.hostel, st.room,
            exists (select 1 from scans p where p.roll_call_id = $2 and p.student_id = st.id and p.result in ${PRESENT_SQL}) as checked_in,
            r.status, r.method, r.at, coalesce(sf.name, case when r.method = 'self' then 'Student' end) as by
       from students st
       left join emergency_responses r on r.emergency_id = $1 and r.student_id = st.id
       left join staff sf on sf.id = r.recorded_by
      where st.active`,
    [emergency.id, rollCall?.id ?? -1],
  );

  const people: HeadcountPerson[] = rows.map((r) => ({
    student: { id: r.id, name: r.name, hostel: r.hostel, room: r.room },
    status: r.status ?? "unaccounted",
    likelyInside: r.checked_in,
    at: r.at ? new Date(r.at).toISOString() : null,
    method: r.method,
    by: r.by,
  }));
  const rank = (p: HeadcountPerson) => (p.status === "help" ? 0 : p.status === "unaccounted" ? (p.likelyInside ? 1 : 2) : 3);
  people.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      naturalOrder.compare(a.student.hostel, b.student.hostel) ||
      naturalOrder.compare(a.student.room, b.student.room),
  );

  return {
    emergency,
    summary: {
      students: people.length,
      safe: people.filter((p) => p.status === "safe").length,
      help: people.filter((p) => p.status === "help").length,
      unaccounted: people.filter((p) => p.status === "unaccounted").length,
      likelyInside: people.filter((p) => p.status === "unaccounted" && p.likelyInside).length,
    },
    people,
  };
}

/**
 * The actions behind POST /api/emergency, shared by the server route and the browser demo.
 *   { action: "start", reason }              warden
 *   { action: "end" }                        warden
 *   { action: "mark", studentId, status }    guard or warden, marking someone by hand
 *   { action: "scan", code }                 guard or warden, scanning a pass at the assembly point
 */
export async function emergencyAction(
  db: Db,
  user: SessionUser,
  body: { action?: unknown; reason?: unknown; studentId?: unknown; status?: unknown; code?: unknown },
): Promise<{ status: number; body: unknown }> {
  if (body.action === "start" || body.action === "end") {
    if (user.role !== "admin") return { status: 403, body: { error: "Only the warden can start or end a headcount" } };
    if (body.action === "start") await startEmergency(db, user, String(body.reason ?? ""));
    else await endEmergency(db, user);
    return { status: 200, body: (await headcount(db)) ?? { emergency: null } };
  }
  if (body.action === "scan") {
    const scan = await scanAtAssembly(db, user, String(body.code ?? "").slice(0, 300));
    return { status: 200, body: { scan, headcount: await headcount(db) } };
  }
  if (body.action === "mark") {
    const emergency = await activeEmergency(db);
    if (!emergency) return { status: 409, body: { error: "There is no headcount running" } };
    if (body.status !== "safe" && body.status !== "help") return { status: 400, body: { error: "Choose safe or help" } };
    if (!(await markSafety(db, emergency.id, String(body.studentId ?? ""), body.status, "staff", user.id))) {
      return { status: 404, body: { error: "Student not found" } };
    }
    return { status: 200, body: await headcount(db) };
  }
  return { status: 400, body: { error: "Unknown action" } };
}

const STATUS_LABELS = { safe: "Safe", help: "Needs help", unaccounted: "Not accounted for" };
const METHOD_TEXT: Record<SafetyMethod, string> = { self: "Own phone", scan: "Pass scanned", staff: "Marked by staff" };

/** The headcount as a spreadsheet, for the fire marshal or a report afterwards. */
export function headcountCsv(count: Headcount): string {
  return toCsv(
    ["Status", "Likely inside", "Student ID", "Name", "Hostel", "Room", "Time", "How", "Recorded by"],
    count.people.map((p) => [
      STATUS_LABELS[p.status],
      p.status === "unaccounted" && p.likelyInside ? "yes" : "",
      p.student.id,
      p.student.name,
      p.student.hostel,
      p.student.room,
      p.at ? formatClock(p.at) : "",
      p.method ? METHOD_TEXT[p.method] : "",
      p.by ?? "",
    ]),
  );
}
