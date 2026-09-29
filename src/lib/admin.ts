/** Admin write actions. Each one leaves an entry in the audit log. */
import { parseCsv } from "./csv";
import type { Db } from "./db";
import { defaultRollCallWindow, getOrCreateActiveRollCall, getRollCall, insertRollCall, type RollCall } from "./rollcall";
import type { SessionUser } from "./session";
import { campusHour, campusTime } from "./time";
import { FLAG_RESULTS } from "./verify";

async function audit(db: Db, actor: SessionUser, action: string, detail: string) {
  await db.query(`insert into audit_log (actor, action, detail) values ($1, $2, $3)`, [actor.id, action, detail]);
}

export async function resolveFlag(db: Db, actor: SessionUser, scanId: number, note: string): Promise<boolean> {
  const rows = await db.query(
    `update scans set resolved_at = now(), resolved_by = $2, resolution_note = $3
      where id = $1 and resolved_at is null and result in ('${FLAG_RESULTS.join("','")}')
      returning id`,
    [scanId, actor.id, note.trim() || "Reviewed"],
  );
  if (rows.length) await audit(db, actor, "resolve_flag", `scan ${scanId}: ${note}`);
  return rows.length > 0;
}

/** Moves the curfew of a roll call. `time` is campus wall-clock "HH:MM"; early-morning times mean after midnight. */
export async function setCurfew(db: Db, actor: SessionUser, rollCallId: number, time: string): Promise<RollCall | null> {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  const rollCall = await getRollCall(db, rollCallId);
  if (!match || !rollCall) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;

  const startsAt = Date.parse(rollCall.startsAt);
  const nextDay = hours < campusHour(startsAt) && hours < 12 ? 1 : 0;
  const curfewAt = campusTime(startsAt, hours, minutes, nextDay);
  await db.query(`update roll_calls set curfew_at = $2 where id = $1`, [rollCallId, new Date(curfewAt)]);
  await audit(db, actor, "set_curfew", `roll call ${rollCallId} set to ${time}`);
  return getRollCall(db, rollCallId);
}

/** Closes the current roll call and opens a fresh one (e.g. a second check later in the night). */
export async function startNewRollCall(db: Db, actor: SessionUser): Promise<RollCall> {
  const now = Date.now();
  const current = await getOrCreateActiveRollCall(db, now);
  await db.query(`update roll_calls set ends_at = $2 where id = $1`, [current.id, new Date(now)]);
  const window = defaultRollCallWindow(now);
  const created = await insertRollCall(db, { ...window, startsAt: now }, actor.id);
  await audit(db, actor, "start_roll_call", created.name);
  return created;
}

export interface RosterImportResult {
  added: number;
  updated: number;
  errors: string[];
}

/**
 * Imports a roster export (CSV) from the university student system.
 * Columns: id, name, email, hostel, room[, active]. Existing IDs are updated in place.
 */
export async function importRoster(db: Db, actor: SessionUser, csv: string): Promise<RosterImportResult> {
  const rows = parseCsv(csv);
  const result: RosterImportResult = { added: 0, updated: 0, errors: [] };
  if (rows.length === 0) return { ...result, errors: ["The file is empty"] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const required = ["id", "name", "email", "hostel", "room"];
  const missing = required.filter((name) => col(name) === -1);
  if (missing.length) return { ...result, errors: [`Missing column(s): ${missing.join(", ")}`] };

  for (const [index, row] of rows.slice(1).entries()) {
    const line = index + 2;
    const get = (name: string) => (col(name) === -1 ? "" : (row[col(name)] ?? "").trim());
    const id = get("id").toUpperCase();
    const activeText = get("active").toLowerCase();
    const active = !["false", "no", "0", "inactive"].includes(activeText);
    if (!/^[A-Z0-9]{4,20}$/.test(id)) {
      result.errors.push(`Line ${line}: invalid ID "${get("id")}"`);
      continue;
    }
    if (!get("name") || !get("email").includes("@") || !get("hostel") || !get("room")) {
      result.errors.push(`Line ${line}: name, email, hostel and room are required`);
      continue;
    }
    try {
      const [row] = await db.query<{ inserted: boolean }>(
        `insert into students (id, name, email, hostel, room, active) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set name = excluded.name, email = excluded.email,
           hostel = excluded.hostel, room = excluded.room, active = excluded.active
         returning (xmax = 0) as inserted`,
        [id, get("name"), get("email").toLowerCase(), get("hostel"), get("room"), active],
      );
      if (row.inserted) result.added++;
      else result.updated++;
    } catch (error) {
      result.errors.push(`Line ${line}: ${(error as Error).message}`);
    }
  }

  await audit(db, actor, "import_roster", `${result.added} added, ${result.updated} updated, ${result.errors.length} errors`);
  return result;
}
