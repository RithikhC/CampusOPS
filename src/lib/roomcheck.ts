/**
 * Room check-in: a student confirms they are in their room without a warden knocking.
 * It only counts with three proofs together:
 *   1. the right phone   (the one registered to the student)
 *   2. the right place   (the signed tag inside their own room, scanned on the hostel network)
 *   3. the right time    (the check-in window before and after curfew)
 * Rejected attempts are recorded, so the warden sees them and visits that room on rounds.
 */
import { config } from "./config";
import { isUniqueViolation, type Db } from "./dbcore";
import { fromHex } from "./pass";
import { getOrCreateActiveRollCall, type RollCall } from "./rollcall";
import { readRoomTag } from "./roomtag";
import { formatClock } from "./time";
import { PRESENT_RESULTS, type ScanResult } from "./verify";

/** Room check-in opens this long before curfew. */
export const CHECKIN_OPENS_MINUTES = 90;

const publicKey = fromHex(config.qrPublicKeyHex);
const PRESENT_SQL = `('${PRESENT_RESULTS.join("','")}')`;

export interface RoomCheckInInput {
  /** Text of the room tag the student scanned. */
  tag: string;
  /** Random ID stored on the student's phone. */
  deviceId: string;
  /** Whether the request came from the hostel network. Decided by the server, never by the phone. */
  onCampus: boolean;
}

export interface RoomCheckInOutcome {
  ok: boolean;
  /** "closed": outside the window. "already": nothing to do. Otherwise the recorded result. */
  result: ScanResult | "closed" | "already";
  message: string;
}

export function checkInOpensAt(rollCall: RollCall): number {
  return Math.max(Date.parse(rollCall.startsAt), Date.parse(rollCall.curfewAt) - CHECKIN_OPENS_MINUTES * 60_000);
}

export async function roomCheckIn(db: Db, studentId: string, input: RoomCheckInInput, nowMs = Date.now()): Promise<RoomCheckInOutcome> {
  const [student] = await db.query<{ id: string; hostel: string; room: string }>(
    `select id, hostel, room from students where id = $1 and active`,
    [studentId],
  );
  if (!student) return { ok: false, result: "unknown", message: "Your account is not on the active student list." };

  const rollCall = await getOrCreateActiveRollCall(db, nowMs);
  const opensAt = checkInOpensAt(rollCall);
  if (nowMs < opensAt) {
    return { ok: false, result: "closed", message: `Room check-in opens at ${formatClock(opensAt)}.` };
  }

  const alreadyIn = async () =>
    (
      await db.query(
        `select 1 from scans where roll_call_id = $1 and student_id = $2 and result in ${PRESENT_SQL} limit 1`,
        [rollCall.id, studentId],
      )
    ).length > 0;
  if (await alreadyIn()) return { ok: true, result: "already", message: "You're already checked in for tonight." };

  const record = (result: ScanResult, reason: string) =>
    db.query(
      `insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at, device_id)
       values ($1, $2, $3, $3, 'student', 'self', $4, $5, $6, $7)`,
      [crypto.randomUUID(), rollCall.id, studentId, result, reason, new Date(nowMs), input.deviceId.slice(0, 64)],
    );
  const reject = async (reason: string, message: string): Promise<RoomCheckInOutcome> => {
    await record("invalid", reason);
    return { ok: false, result: "invalid", message };
  };

  const [device] = await db.query<{ device_id: string }>(`select device_id from student_devices where student_id = $1`, [studentId]);
  if (device && device.device_id !== input.deviceId) {
    return reject(
      "Room check-in tried from a phone that isn't registered to this student",
      "This isn't the phone registered to your account. Ask the hostel office to register your new phone.",
    );
  }
  if (!input.onCampus) {
    return reject("Room check-in tried from outside the hostel network", "Connect to the hostel Wi-Fi to check in from your room.");
  }
  const tag = readRoomTag(input.tag, publicKey);
  if (!tag) {
    return reject("Room check-in with something that isn't a NightPass room tag", "That isn't a NightPass room tag. Scan the tag inside your room.");
  }
  if (tag.hostel !== student.hostel || tag.room !== student.room) {
    return reject(
      `Scanned the tag for room ${tag.room}, but is assigned to room ${student.room}`,
      `That tag is for room ${tag.room}. Scan the tag in your own room (${student.room}).`,
    );
  }

  if (!device) {
    await db.query(
      `insert into student_devices (student_id, device_id, registered_at) values ($1, $2, $3) on conflict (student_id) do nothing`,
      [studentId, input.deviceId.slice(0, 64), new Date(nowMs)],
    );
  }

  const curfewAt = Date.parse(rollCall.curfewAt);
  const late = nowMs > curfewAt;
  try {
    await record(
      late ? "late" : "valid",
      late ? `Room check-in ${Math.ceil((nowMs - curfewAt) / 60_000)} min after curfew` : `Checked in from room ${student.room}`,
    );
  } catch (error) {
    // A gate scan or the warden marked them present in the same moment.
    if (isUniqueViolation(error)) return { ok: true, result: "already", message: "You're already checked in for tonight." };
    throw error;
  }
  return {
    ok: true,
    result: late ? "late" : "valid",
    message: late ? "Checked in, but after curfew. The warden will see it as late." : "You're checked in for tonight.",
  };
}
