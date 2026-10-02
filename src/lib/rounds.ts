/**
 * Warden's rounds. Instead of knocking on every door, the warden only visits:
 *   - students who haven't checked in, and
 *   - spot checks: room check-ins that look less certain, plus a small random sample so that
 *     nobody can count on never being checked.
 * A student scanned at the gate by a guard was seen in person, so they are never on the list.
 */
import type { Db } from "./dbcore";
import { getOrCreateActiveRollCall, getRollCall, type RollCall } from "./rollcall";
import type { SessionUser } from "./session";
import { formatClock } from "./time";
import { PRESENT_RESULTS, type RosterEntry, type ScanMethod } from "./verify";

/** Share of room check-ins picked at random for a visit, on top of the risk-based ones. */
export const RANDOM_SPOT_CHECK_PERCENT = 6;
const MISSED_NIGHTS_THRESHOLD = 2;
const PRESENT_SQL = `('${PRESENT_RESULTS.join("','")}')`;

export type VisitOutcome = "present" | "absent";

export interface RoundItem {
  student: RosterEntry;
  /** "missing": no check-in tonight. "spot": checked in from the room, picked for a visit. */
  kind: "missing" | "spot";
  reasons: string[];
  checkedInAt: string | null;
  visit: { outcome: VisitOutcome; at: string; by: string | null } | null;
}

export interface Rounds {
  rollCall: RollCall;
  curfewPassed: boolean;
  items: RoundItem[];
  summary: {
    students: number;
    checkedIn: number;
    /** Rooms on tonight's list (missing + spot checks). */
    toVisit: number;
    visited: number;
    missing: number;
    spotChecks: number;
    /** Students confirmed without anyone going to their door. */
    noVisitNeeded: number;
  };
}

interface Row {
  id: string;
  name: string;
  hostel: string;
  room: string;
  presence_method: ScanMethod | null;
  presence_at: Date | null;
  rejected: number;
  device_at: Date | null;
  missed: number;
  outcome: VisitOutcome | null;
  visited_at: Date | null;
  visited_by: string | null;
}

/** Stable per student per night, so the list doesn't reshuffle every time it's loaded. */
function pickedAtRandom(studentId: string, rollCallId: number): boolean {
  let hash = 2166136261;
  for (const ch of `${studentId}:${rollCallId}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash % 100 < RANDOM_SPOT_CHECK_PERCENT;
}

const naturalOrder = new Intl.Collator("en", { numeric: true });

export async function buildRounds(db: Db, rollCallId?: number, nowMs = Date.now()): Promise<Rounds | null> {
  const rollCall = rollCallId ? await getRollCall(db, rollCallId) : await getOrCreateActiveRollCall(db, nowMs);
  if (!rollCall) return null;
  const startsAt = new Date(Date.parse(rollCall.startsAt));

  const rows = await db.query<Row>(
    `select st.id, st.name, st.hostel, st.room,
            p.method as presence_method, p.scanned_at as presence_at,
            (select count(*)::int from scans r
              where r.roll_call_id = $1 and r.student_id = st.id and r.result in ('invalid', 'expired')) as rejected,
            d.registered_at as device_at,
            (select count(*)::int from roll_calls rc
              where rc.id <> $1 and rc.starts_at < $2 and rc.starts_at > $2::timestamptz - interval '7 days'
                and not exists (select 1 from scans s
                                 where s.roll_call_id = rc.id and s.student_id = st.id and s.result in ${PRESENT_SQL})) as missed,
            v.outcome, v.visited_at, vs.name as visited_by
       from students st
       left join scans p on p.roll_call_id = $1 and p.student_id = st.id and p.result in ${PRESENT_SQL}
       left join student_devices d on d.student_id = st.id
       left join room_visits v on v.roll_call_id = $1 and v.student_id = st.id
       left join staff vs on vs.id = v.visited_by
      where st.active`,
    [rollCall.id, startsAt],
  );

  const items: RoundItem[] = [];
  for (const row of rows) {
    const student = { id: row.id, name: row.name, hostel: row.hostel, room: row.room };
    const visit = row.outcome ? { outcome: row.outcome, at: new Date(row.visited_at!).toISOString(), by: row.visited_by } : null;
    const checkedInAt = row.presence_at ? new Date(row.presence_at).toISOString() : null;

    // Seen in person tonight (gate scan, manual entry or an earlier visit): nothing more to do,
    // unless the warden already visited, in which case keep showing the outcome.
    if (!row.presence_method) {
      const reason =
        visit?.outcome === "absent"
          ? "Not in the room when visited"
          : row.rejected > 0
            ? "No check-in, and a rejected attempt tonight"
            : "No check-in tonight";
      items.push({ student, kind: "missing", reasons: [reason], checkedInAt: null, visit });
      continue;
    }
    if (row.presence_method !== "self") {
      if (visit) items.push({ student, kind: "missing", reasons: ["Had no check-in until the visit"], checkedInAt, visit });
      continue;
    }

    const reasons: string[] = [];
    if (row.rejected > 0) reasons.push("Had a rejected attempt tonight");
    if (row.device_at && new Date(row.device_at) >= startsAt) reasons.push("New phone registered tonight");
    if (row.missed >= MISSED_NIGHTS_THRESHOLD) reasons.push(`Missed ${row.missed} of the last 6 nights`);
    if (reasons.length === 0 && pickedAtRandom(row.id, rollCall.id)) reasons.push("Picked at random");
    if (reasons.length > 0 || visit) {
      items.push({ student, kind: "spot", reasons: reasons.length ? reasons : ["Spot check"], checkedInAt, visit });
    }
  }

  // Walking order: block, then room.
  items.sort((a, b) => naturalOrder.compare(a.student.hostel, b.student.hostel) || naturalOrder.compare(a.student.room, b.student.room));

  const checkedIn = rows.filter((r) => r.presence_method).length;
  const missing = items.filter((i) => i.kind === "missing" && !(i.visit && i.checkedInAt)).length;
  const spotChecks = items.filter((i) => i.kind === "spot").length;
  return {
    rollCall,
    curfewPassed: nowMs > Date.parse(rollCall.curfewAt),
    items,
    summary: {
      students: rows.length,
      checkedIn,
      toVisit: items.length,
      visited: items.filter((i) => i.visit).length,
      missing,
      spotChecks,
      noVisitNeeded: rows.length - items.length,
    },
  };
}

/** Records what the warden found at the door. */
export async function recordVisit(db: Db, user: SessionUser, studentId: string, outcome: VisitOutcome, nowMs = Date.now()): Promise<boolean> {
  const rollCall = await getOrCreateActiveRollCall(db, nowMs);
  const [student] = await db.query<{ id: string }>(`select id from students where id = $1 and active`, [studentId]);
  if (!student) return false;
  const now = new Date(nowMs);

  await db.query(
    `insert into room_visits (roll_call_id, student_id, outcome, visited_by, visited_at) values ($1, $2, $3, $4, $5)
     on conflict (roll_call_id, student_id) do update set outcome = excluded.outcome, visited_by = excluded.visited_by, visited_at = excluded.visited_at`,
    [rollCall.id, studentId, outcome, user.id, now],
  );

  const [presence] = await db.query<{ id: number; method: ScanMethod; scanned_at: Date }>(
    `select id, method, scanned_at from scans where roll_call_id = $1 and student_id = $2 and result in ${PRESENT_SQL} limit 1`,
    [rollCall.id, studentId],
  );

  if (outcome === "present") {
    // A "not in room" from earlier tonight no longer needs following up.
    await db.query(
      `update scans set resolved_at = $3, resolved_by = $4, resolution_note = 'Later seen in the room'
        where roll_call_id = $1 and student_id = $2 and result = 'absent' and resolved_at is null`,
      [rollCall.id, studentId, now, user.id],
    );
    if (!presence) {
      await db.query(
        `insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at)
         values ($1, $2, $3, $3, $4, 'round', 'valid', 'Seen in the room during rounds', $5)
         on conflict do nothing`,
        [crypto.randomUUID(), rollCall.id, studentId, user.id, now],
      );
    }
    return true;
  }

  if (presence?.method === "self") {
    // They checked in from the room but weren't there: the check-in no longer counts.
    await db.query(
      `update scans set result = 'absent', scanned_by = $2,
              reason = $3, resolved_at = null, resolved_by = null, resolution_note = null
        where id = $1`,
      [presence.id, user.id, `Checked in from the room at ${formatClock(presence.scanned_at)}, but was not there during rounds at ${formatClock(nowMs)}`],
    );
  } else if (!presence) {
    const [existing] = await db.query(
      `select 1 from scans where roll_call_id = $1 and student_id = $2 and result = 'absent' and resolved_at is null limit 1`,
      [rollCall.id, studentId],
    );
    if (!existing) {
      await db.query(
        `insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at)
         values ($1, $2, $3, $3, $4, 'round', 'absent', $5, $6)`,
        [crypto.randomUUID(), rollCall.id, studentId, user.id, `Not in the room during rounds at ${formatClock(nowMs)}`, now],
      );
    }
  }
  return true;
}
