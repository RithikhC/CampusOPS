/** Roll calls: one per night, created automatically so guards never have to "set anything up". */
import type { Db } from "./dbcore";
import { campusHour, campusTime, formatDate } from "./time";

export const DEFAULT_CURFEW = { hours: 22, minutes: 30 };
const NIGHT_STARTS_HOUR = 18;
const NIGHT_ENDS_HOUR = 6;

export interface RollCall {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  curfewAt: string;
}

interface RollCallRow {
  id: number;
  name: string;
  starts_at: Date;
  ends_at: Date;
  curfew_at: Date;
}

export function toRollCall(row: RollCallRow): RollCall {
  return {
    id: row.id,
    name: row.name,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    curfewAt: new Date(row.curfew_at).toISOString(),
  };
}

/**
 * The window a new roll call should cover. At night it is the standard 18:00–06:00 window with a
 * 22:30 curfew. During the day (e.g. a demo) it starts now, with curfew an hour away.
 */
export function defaultRollCallWindow(nowMs: number) {
  const hour = campusHour(nowMs);
  if (hour >= NIGHT_STARTS_HOUR || hour < NIGHT_ENDS_HOUR) {
    const eveningOffset = hour < NIGHT_ENDS_HOUR ? -1 : 0;
    const startsAt = campusTime(nowMs, NIGHT_STARTS_HOUR, 0, eveningOffset);
    return {
      name: `Night roll call · ${formatDate(startsAt)}`,
      startsAt,
      endsAt: campusTime(nowMs, NIGHT_ENDS_HOUR, 0, eveningOffset + 1),
      curfewAt: campusTime(nowMs, DEFAULT_CURFEW.hours, DEFAULT_CURFEW.minutes, eveningOffset),
    };
  }
  const startsAt = nowMs - 30 * 60_000;
  return {
    name: `Roll call · ${formatDate(nowMs)}`,
    startsAt,
    endsAt: nowMs + 12 * 60 * 60_000,
    curfewAt: Math.ceil((nowMs + 60 * 60_000) / 300_000) * 300_000,
  };
}

export async function insertRollCall(
  db: Db,
  window: { name: string; startsAt: number; endsAt: number; curfewAt: number },
  createdBy: string,
): Promise<RollCall> {
  const [row] = await db.query<RollCallRow>(
    `insert into roll_calls (name, starts_at, ends_at, curfew_at, created_by)
     values ($1, $2, $3, $4, $5) returning *`,
    [window.name, new Date(window.startsAt), new Date(window.endsAt), new Date(window.curfewAt), createdBy],
  );
  return toRollCall(row);
}

export async function findActiveRollCall(db: Db, nowMs = Date.now()): Promise<RollCall | null> {
  const [row] = await db.query<RollCallRow>(
    `select * from roll_calls where starts_at <= $1 and ends_at > $1 order by starts_at desc limit 1`,
    [new Date(nowMs)],
  );
  return row ? toRollCall(row) : null;
}

let creating: Promise<RollCall> | null = null;

export async function getOrCreateActiveRollCall(db: Db, nowMs = Date.now()): Promise<RollCall> {
  const active = await findActiveRollCall(db, nowMs);
  if (active) return active;
  // Several screens poll at once; make sure only one of them creates tonight's roll call.
  creating ??= insertRollCall(db, defaultRollCallWindow(nowMs), "system").finally(() => {
    creating = null;
  });
  return creating;
}

export async function getRollCall(db: Db, id: number): Promise<RollCall | null> {
  const [row] = await db.query<RollCallRow>(`select * from roll_calls where id = $1`, [id]);
  return row ? toRollCall(row) : null;
}

export async function listRollCalls(db: Db, limit = 14): Promise<RollCall[]> {
  const rows = await db.query<RollCallRow>(`select * from roll_calls order by starts_at desc limit $1`, [limit]);
  return rows.map(toRollCall);
}
