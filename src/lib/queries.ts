/** Read models for the three apps. Each returns plain JSON-safe objects. */
import { config } from "./config";
import type { Db } from "./dbcore";
import { activeEmergency, headcount, type Emergency, type Headcount, type SafetyStatus } from "./emergency";
import { PERIOD_SECONDS, periodAt, signPass } from "./pass";
import { getOrCreateActiveRollCall, getRollCall, listRollCalls, type RollCall } from "./rollcall";
import { checkInOpensAt } from "./roomcheck";
import { buildRounds, type Rounds } from "./rounds";
import { FLAG_RESULTS, PRESENT_RESULTS, type RosterEntry, type ScanMethod, type ScanResult } from "./verify";
import { issueChallenge } from "./webauthn";

const PRESENT_SQL = `('${PRESENT_RESULTS.join("','")}')`;
const FLAG_SQL = `('${FLAG_RESULTS.join("','")}')`;
/** How far ahead a student's phone is pre-loaded with codes, so the pass works without signal. */
const PRELOAD_MINUTES = 20;

/** Signed codes are reused across refreshes; signing 80 codes on every poll is wasted work. */
const signedCodes = new Map<string, string>();
function cachedPass(studentId: string, period: number): string {
  const key = `${studentId}.${period}`;
  let code = signedCodes.get(key);
  if (!code) {
    code = signPass(studentId, period, config.qrSigningKey);
    if (signedCodes.size > 20_000) signedCodes.clear();
    signedCodes.set(key, code);
  }
  return code;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

/** Where a check-in happened, for records without a gate. */
export const PLACE_SQL = `coalesce(c.name, case s.method when 'self' then 'Room check-in' when 'round' then 'Warden''s rounds' end)`;

// ---------------------------------------------------------------- student

export interface StudentPassData {
  student: RosterEntry & { email: string };
  rollCall: RollCall;
  status: { result: ScanResult; at: string; checkpoint: string | null; method: ScanMethod } | null;
  /**
   * When room check-in opens tonight and whether it is open now, plus what the phone needs for the
   * fingerprint check: a fresh challenge, and the passkey registered for this student (if any).
   */
  roomCheckIn: { opensAt: string; open: boolean; challenge: string; credentialId: string | null };
  /** A headcount in progress, and this student's answer so far. */
  emergency: { id: number; reason: string; startedAt: string; mine: { status: SafetyStatus; at: string } | null } | null;
  codes: { period: number; code: string }[];
  periodSeconds: number;
  serverNow: number;
  history: { name: string; startsAt: string; result: ScanResult | null; at: string | null }[];
}

export async function studentPass(db: Db, studentId: string): Promise<StudentPassData | null> {
  const now = Date.now();
  const [student] = await db.query<RosterEntry & { email: string }>(
    `select id, name, email, hostel, room from students where id = $1 and active`,
    [studentId],
  );
  if (!student) return null;

  const rollCall = await getOrCreateActiveRollCall(db, now);
  const [status] = await db.query<{ result: ScanResult; scanned_at: Date; checkpoint: string | null; method: ScanMethod }>(
    `select s.result, s.scanned_at, c.name as checkpoint, s.method
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${PRESENT_SQL}
      limit 1`,
    [rollCall.id, studentId],
  );

  const [device] = await db.query<{ credential_id: string | null }>(`select credential_id from student_devices where student_id = $1`, [studentId]);
  const emergency = await activeEmergency(db);
  const [mine] = emergency
    ? await db.query<{ status: SafetyStatus; at: Date }>(
        `select status, at from emergency_responses where emergency_id = $1 and student_id = $2`,
        [emergency.id, studentId],
      )
    : [];

  const history = await db.query<{ name: string; starts_at: Date; result: ScanResult | null; scanned_at: Date | null }>(
    `select rc.name, rc.starts_at, s.result, s.scanned_at
       from roll_calls rc
       left join scans s on s.roll_call_id = rc.id and s.student_id = $1 and s.result in ${PRESENT_SQL}
      where rc.id <> $2 and rc.starts_at < $3
      order by rc.starts_at desc limit 6`,
    [studentId, rollCall.id, new Date(now)],
  );

  const first = periodAt(now) - 1;
  const count = (PRELOAD_MINUTES * 60) / PERIOD_SECONDS;
  const codes = Array.from({ length: count }, (_, i) => ({
    period: first + i,
    code: cachedPass(studentId, first + i),
  }));

  return {
    student,
    rollCall,
    status: status ? { result: status.result, at: iso(status.scanned_at)!, checkpoint: status.checkpoint, method: status.method } : null,
    roomCheckIn: {
      opensAt: new Date(checkInOpensAt(rollCall)).toISOString(),
      open: now >= checkInOpensAt(rollCall),
      challenge: issueChallenge(studentId, now, config.qrSigningKey),
      credentialId: device?.credential_id ?? null,
    },
    emergency: emergency && {
      id: emergency.id,
      reason: emergency.reason,
      startedAt: emergency.startedAt,
      mine: mine ? { status: mine.status, at: iso(mine.at)! } : null,
    },
    codes,
    periodSeconds: PERIOD_SECONDS,
    serverNow: now,
    history: history.map((h) => ({ name: h.name, startsAt: iso(h.starts_at)!, result: h.result, at: iso(h.scanned_at) })),
  };
}

// ---------------------------------------------------------------- guard

export interface GuardBootstrap {
  rollCall: RollCall;
  checkpoints: { id: string; name: string }[];
  roster: RosterEntry[];
  present: { studentId: string; at: string; checkpoint: string }[];
  publicKeyHex: string;
  serverNow: number;
  flagsOpen: number;
  emergency: Emergency | null;
}

export async function guardBootstrap(db: Db): Promise<GuardBootstrap> {
  const now = Date.now();
  const rollCall = await getOrCreateActiveRollCall(db, now);
  const [checkpoints, roster, present, [{ count }], emergency] = await Promise.all([
    db.query<{ id: string; name: string }>(`select id, name from checkpoints order by hostel nulls last, name`),
    db.query<RosterEntry>(`select id, name, hostel, room from students where active order by name`),
    db.query<{ student_id: string; scanned_at: Date; checkpoint: string | null }>(
      `select s.student_id, s.scanned_at, ${PLACE_SQL} as checkpoint
         from scans s left join checkpoints c on c.id = s.checkpoint_id
        where s.roll_call_id = $1 and s.result in ${PRESENT_SQL}`,
      [rollCall.id],
    ),
    db.query<{ count: number }>(
      `select count(*)::int as count from scans where roll_call_id = $1 and result in ${FLAG_SQL} and resolved_at is null`,
      [rollCall.id],
    ),
    activeEmergency(db),
  ]);

  return {
    rollCall,
    checkpoints,
    roster,
    present: present.map((p) => ({ studentId: p.student_id, at: iso(p.scanned_at)!, checkpoint: p.checkpoint ?? "another gate" })),
    publicKeyHex: config.qrPublicKeyHex,
    serverNow: now,
    flagsOpen: count,
    emergency,
  };
}

// ---------------------------------------------------------------- admin

export interface ScanRecord {
  id: number;
  scannedAt: string;
  receivedAt: string;
  result: ScanResult;
  reason: string;
  method: ScanMethod;
  offline: boolean;
  studentId: string | null;
  claimedId: string | null;
  studentName: string | null;
  hostel: string | null;
  room: string | null;
  checkpoint: string | null;
  scannedBy: string | null;
  rollCall: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

const RECORD_SELECT = `
  select s.id, s.scanned_at, s.received_at, s.result, s.reason, s.method, s.offline, s.student_id, s.claimed_id,
         st.name as student_name, st.hostel, st.room, ${PLACE_SQL} as checkpoint, sf.name as scanned_by,
         rc.name as roll_call, s.resolved_at, rs.name as resolved_by, s.resolution_note
    from scans s
    join roll_calls rc on rc.id = s.roll_call_id
    left join students st on st.id = s.student_id
    left join checkpoints c on c.id = s.checkpoint_id
    left join staff sf on sf.id = s.scanned_by
    left join staff rs on rs.id = s.resolved_by`;

interface RecordRow {
  id: number; scanned_at: Date; received_at: Date; result: ScanResult; reason: string; method: ScanMethod;
  offline: boolean; student_id: string | null; claimed_id: string | null; student_name: string | null;
  hostel: string | null; room: string | null; checkpoint: string | null; scanned_by: string | null;
  roll_call: string; resolved_at: Date | null; resolved_by: string | null; resolution_note: string | null;
}

function toRecord(r: RecordRow): ScanRecord {
  return {
    id: r.id,
    scannedAt: iso(r.scanned_at)!,
    receivedAt: iso(r.received_at)!,
    result: r.result,
    reason: r.reason,
    method: r.method,
    offline: r.offline,
    studentId: r.student_id,
    claimedId: r.claimed_id,
    studentName: r.student_name,
    hostel: r.hostel,
    room: r.room,
    checkpoint: r.checkpoint,
    scannedBy: r.scanned_by,
    rollCall: r.roll_call,
    resolvedAt: iso(r.resolved_at),
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
  };
}

export interface MissingStudent extends RosterEntry {
  email: string;
  /** A rejected scan tonight for someone who never checked in is worth a closer look. */
  lastAttempt: { result: ScanResult; at: string; reason: string } | null;
}

/** One room on the hostel map, and how each student in it stands tonight. */
export interface MapRoom {
  hostel: string;
  room: string;
  students: { id: string; name: string; state: RoomState }[];
}
/** in: confirmed. check: spot check not done yet. missing: no check-in. absent: not in the room when visited. */
export type RoomState = "in" | "check" | "missing" | "absent";

export interface AdminOverview {
  rollCall: RollCall;
  rollCalls: RollCall[];
  isLive: boolean;
  stats: { expected: number; present: number; missing: number; late: number; manual: number; flagsOpen: number; rejected: number };
  /** How tonight's present students were confirmed. */
  verifiedBy: Record<ScanMethod, number>;
  rounds: Rounds;
  rooms: MapRoom[];
  /** A headcount in progress. */
  emergency: Headcount | null;
  byHostel: { hostel: string; expected: number; present: number }[];
  arrivals: { at: string; count: number }[];
  trend: { id: number; name: string; startsAt: string; present: number; late: number }[];
  feed: ScanRecord[];
  flags: ScanRecord[];
  missing: MissingStudent[];
}

export async function adminOverview(db: Db, rollCallId?: number): Promise<AdminOverview | null> {
  const now = Date.now();
  const rollCall = rollCallId ? await getRollCall(db, rollCallId) : await getOrCreateActiveRollCall(db, now);
  if (!rollCall) return null;

  const [rollCalls, byHostel, counts, presentTimes, trend, feed, flags, missing, methods, rounds, roster, emergency] = await Promise.all([
    listRollCalls(db),
    db.query<{ hostel: string; expected: number; present: number }>(
      `select st.hostel, count(*)::int as expected, count(p.student_id)::int as present
         from students st
         left join scans p on p.student_id = st.id and p.roll_call_id = $1 and p.result in ${PRESENT_SQL}
        where st.active
        group by st.hostel order by st.hostel`,
      [rollCall.id],
    ),
    db.query<{ result: ScanResult; total: number; open: number }>(
      `select result, count(*)::int as total, count(*) filter (where resolved_at is null)::int as open
         from scans where roll_call_id = $1 group by result`,
      [rollCall.id],
    ),
    db.query<{ scanned_at: Date }>(
      `select scanned_at from scans where roll_call_id = $1 and result in ${PRESENT_SQL} order by scanned_at`,
      [rollCall.id],
    ),
    db.query<{ id: number; name: string; starts_at: Date; present: number; late: number }>(
      `select rc.id, rc.name, rc.starts_at,
              count(s.id) filter (where s.result in ${PRESENT_SQL})::int as present,
              count(s.id) filter (where s.result = 'late')::int as late
         from roll_calls rc left join scans s on s.roll_call_id = rc.id
        where rc.starts_at <= $1
        group by rc.id order by rc.starts_at desc limit 7`,
      [new Date(Date.parse(rollCall.startsAt))],
    ),
    db.query<RecordRow>(`${RECORD_SELECT} where s.roll_call_id = $1 order by s.scanned_at desc limit 40`, [rollCall.id]),
    db.query<RecordRow>(
      `${RECORD_SELECT} where s.roll_call_id = $1 and s.result in ${FLAG_SQL} and s.resolved_at is null
       order by s.scanned_at desc limit 100`,
      [rollCall.id],
    ),
    db.query<RosterEntry & { email: string; attempt_result: ScanResult | null; attempt_at: Date | null; attempt_reason: string | null }>(
      `select st.id, st.name, st.email, st.hostel, st.room,
              a.result as attempt_result, a.scanned_at as attempt_at, a.reason as attempt_reason
         from students st
         left join lateral (
           select result, scanned_at, reason from scans
            where roll_call_id = $1 and student_id = st.id order by scanned_at desc limit 1
         ) a on true
        where st.active and not exists (
          select 1 from scans p where p.roll_call_id = $1 and p.student_id = st.id and p.result in ${PRESENT_SQL}
        )
        order by (a.result is null), st.hostel, st.name`,
      [rollCall.id],
    ),
    db.query<{ method: ScanMethod; count: number }>(
      `select method, count(*)::int as count from scans where roll_call_id = $1 and result in ${PRESENT_SQL} group by method`,
      [rollCall.id],
    ),
    buildRounds(db, rollCall.id, now),
    db.query<RosterEntry>(`select id, name, hostel, room from students where active order by hostel, room, name`),
    headcount(db),
  ]);

  const count = (result: ScanResult) => counts.find((c) => c.result === result);
  const expected = byHostel.reduce((sum, h) => sum + h.expected, 0);
  const present = byHostel.reduce((sum, h) => sum + h.present, 0);

  return {
    rollCall,
    rollCalls,
    isLive: Date.parse(rollCall.startsAt) <= now && Date.parse(rollCall.endsAt) > now,
    stats: {
      expected,
      present,
      missing: expected - present,
      late: count("late")?.total ?? 0,
      manual: count("manual")?.total ?? 0,
      flagsOpen: counts.filter((c) => FLAG_RESULTS.includes(c.result)).reduce((sum, c) => sum + c.open, 0),
      rejected: counts.filter((c) => !PRESENT_RESULTS.includes(c.result)).reduce((sum, c) => sum + c.total, 0),
    },
    verifiedBy: {
      self: methods.find((m) => m.method === "self")?.count ?? 0,
      qr: methods.find((m) => m.method === "qr")?.count ?? 0,
      round: methods.find((m) => m.method === "round")?.count ?? 0,
      manual: methods.find((m) => m.method === "manual")?.count ?? 0,
    },
    rounds: rounds!,
    rooms: roomMap(roster, rounds!),
    emergency,
    byHostel,
    arrivals: bucketArrivals(presentTimes.map((p) => new Date(p.scanned_at).getTime())),
    trend: trend.reverse().map((t) => ({ id: t.id, name: t.name, startsAt: iso(t.starts_at)!, present: t.present, late: t.late })),
    feed: feed.map(toRecord),
    flags: flags.map(toRecord),
    missing: missing.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      hostel: m.hostel,
      room: m.room,
      lastAttempt: m.attempt_result ? { result: m.attempt_result, at: iso(m.attempt_at)!, reason: m.attempt_reason ?? "" } : null,
    })),
  };
}

function roomMap(roster: RosterEntry[], rounds: Rounds): MapRoom[] {
  const onList = new Map(rounds.items.map((item) => [item.student.id, item]));
  const rooms = new Map<string, MapRoom>();
  for (const student of roster) {
    const item = onList.get(student.id);
    const state: RoomState = !item
      ? "in"
      : item.visit
        ? item.visit.outcome === "present"
          ? "in"
          : "absent"
        : item.kind === "spot"
          ? "check"
          : "missing";
    const key = `${student.hostel}|${student.room}`;
    if (!rooms.has(key)) rooms.set(key, { hostel: student.hostel, room: student.room, students: [] });
    rooms.get(key)!.students.push({ id: student.id, name: student.name, state });
  }
  return [...rooms.values()];
}

/** Check-ins per 15 minutes, for the arrivals chart. */
function bucketArrivals(times: number[]): { at: string; count: number }[] {
  if (times.length === 0) return [];
  const size = 15 * 60_000;
  const first = Math.floor(times[0] / size) * size;
  const last = Math.floor(times[times.length - 1] / size) * size;
  const buckets = new Map<number, number>();
  for (let t = first; t <= last; t += size) buckets.set(t, 0);
  for (const t of times) {
    const key = Math.floor(t / size) * size;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets].map(([at, count]) => ({ at: new Date(at).toISOString(), count }));
}

export interface RecordFilters {
  q?: string;
  result?: string;
  hostel?: string;
  rollCallId?: number;
  from?: string;
  to?: string;
  limit?: number;
}

export function filtersFromSearchParams(params: URLSearchParams): RecordFilters {
  const rollCallId = Number(params.get("rollCallId"));
  return {
    q: params.get("q") ?? undefined,
    result: params.get("result") ?? undefined,
    hostel: params.get("hostel") ?? undefined,
    rollCallId: Number.isInteger(rollCallId) && rollCallId > 0 ? rollCallId : undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };
}

export async function searchRecords(db: Db, filters: RecordFilters): Promise<ScanRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(clause(`$${params.length}`));
  };

  if (filters.q?.trim()) {
    add((p) => `(st.name ilike ${p} or s.student_id ilike ${p} or s.claimed_id ilike ${p} or st.room ilike ${p})`, `%${filters.q.trim()}%`);
  }
  if (filters.result === "present") where.push(`s.result in ${PRESENT_SQL}`);
  else if (filters.result === "flagged") where.push(`s.result in ${FLAG_SQL}`);
  else if (filters.result === "open") where.push(`s.result in ${FLAG_SQL} and s.resolved_at is null`);
  else if (filters.result) add((p) => `s.result = ${p}`, filters.result);
  if (filters.hostel) add((p) => `st.hostel = ${p}`, filters.hostel);
  if (filters.rollCallId) add((p) => `s.roll_call_id = ${p}`, filters.rollCallId);
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) add((p) => `s.scanned_at >= ${p}`, new Date(filters.from));
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) add((p) => `s.scanned_at < ${p}`, new Date(filters.to));

  params.push(Math.min(filters.limit ?? 300, 10_000));
  const rows = await db.query<RecordRow>(
    `${RECORD_SELECT} ${where.length ? `where ${where.join(" and ")}` : ""}
     order by s.scanned_at desc limit $${params.length}`,
    params,
  );
  return rows.map(toRecord);
}
