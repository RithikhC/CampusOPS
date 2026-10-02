/** Records scans sent by scanners. The server re-checks every scan; its verdict is final. */
import { config } from "./config";
import { isUniqueViolation, type Db } from "./dbcore";
import { fromHex, parsePass } from "./pass";
import { getOrCreateActiveRollCall } from "./rollcall";
import type { SessionUser } from "./session";
import {
  PRESENT_RESULTS,
  verifyManual,
  verifyPass,
  type Presence,
  type RosterEntry,
  type ScanMethod,
  type ScanResult,
  type Verdict,
} from "./verify";

export interface IncomingScan {
  clientId: string;
  method: ScanMethod;
  /** Raw QR text (method = qr). */
  raw?: string;
  /** Student picked by the guard (method = manual). */
  studentId?: string;
  note?: string;
  checkpointId: string;
  /** When the guard scanned, in ms. Offline scans arrive later than this. */
  scannedAt: number;
  offline: boolean;
}

export interface ScanOutcome {
  clientId: string;
  result: ScanResult;
  reason: string;
  claimedId: string | null;
  student: RosterEntry | null;
  scannedAt: string;
}

const publicKey = fromHex(config.qrPublicKeyHex);
const PRESENT_SQL = `('${PRESENT_RESULTS.join("','")}')`;
const DAY_MS = 24 * 60 * 60_000;

export function parseIncomingScans(body: unknown): IncomingScan[] | null {
  const list = (body as { scans?: unknown })?.scans;
  if (!Array.isArray(list) || list.length === 0 || list.length > 500) return null;
  const scans: IncomingScan[] = [];
  for (const item of list) {
    const s = item as Partial<IncomingScan>;
    if (typeof s.clientId !== "string" || s.clientId.length > 64) return null;
    if (s.method !== "qr" && s.method !== "manual") return null;
    if (typeof s.checkpointId !== "string" || typeof s.scannedAt !== "number") return null;
    scans.push({
      clientId: s.clientId,
      method: s.method,
      raw: typeof s.raw === "string" ? s.raw.slice(0, 512) : undefined,
      studentId: typeof s.studentId === "string" ? s.studentId.slice(0, 32) : undefined,
      note: typeof s.note === "string" ? s.note.slice(0, 200) : undefined,
      checkpointId: s.checkpointId,
      scannedAt: s.scannedAt,
      offline: Boolean(s.offline),
    });
  }
  return scans;
}

async function findStudent(db: Db, id: string): Promise<RosterEntry | undefined> {
  const [row] = await db.query<RosterEntry>(
    `select id, name, hostel, room from students where id = $1 and active`,
    [id],
  );
  return row;
}

async function findPresence(db: Db, rollCallId: number, studentId: string): Promise<Presence | undefined> {
  const [row] = await db.query<{ scanned_at: Date; checkpoint: string | null }>(
    `select s.scanned_at, coalesce(c.name, case s.method when 'self' then 'room check-in' when 'round' then 'warden''s rounds' end) as checkpoint
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${PRESENT_SQL}
      limit 1`,
    [rollCallId, studentId],
  );
  return row ? { atMs: new Date(row.scanned_at).getTime(), checkpoint: row.checkpoint ?? "another gate" } : undefined;
}

async function findExisting(db: Db, clientId: string): Promise<ScanOutcome | null> {
  const [row] = await db.query<{
    result: ScanResult; reason: string; claimed_id: string | null; scanned_at: Date;
    id: string | null; name: string | null; hostel: string | null; room: string | null;
  }>(
    `select s.result, s.reason, s.claimed_id, s.scanned_at, st.id, st.name, st.hostel, st.room
       from scans s left join students st on st.id = s.student_id
      where s.client_id = $1`,
    [clientId],
  );
  if (!row) return null;
  return {
    clientId,
    result: row.result,
    reason: row.reason,
    claimedId: row.claimed_id,
    student: row.id ? { id: row.id, name: row.name!, hostel: row.hostel!, room: row.room! } : null,
    scannedAt: new Date(row.scanned_at).toISOString(),
  };
}

async function judge(db: Db, scan: IncomingScan, rollCallId: number, curfewAtMs: number, scannedAt: number): Promise<Verdict> {
  const claimedId = scan.method === "qr" ? parsePass(scan.raw ?? "")?.studentId : scan.studentId;
  const student = claimedId ? await findStudent(db, claimedId) : undefined;
  const presence = claimedId ? await findPresence(db, rollCallId, claimedId) : undefined;
  const ctx = {
    nowMs: scannedAt,
    publicKey,
    curfewAtMs,
    findStudent: (id: string) => (id === claimedId ? student : undefined),
    findPresence: (id: string) => (id === claimedId ? presence : undefined),
  };
  return scan.method === "qr" ? verifyPass(scan.raw ?? "", ctx) : verifyManual(scan.studentId ?? "", scan.note ?? "", ctx);
}

export async function recordScans(db: Db, user: SessionUser, scans: IncomingScan[]): Promise<ScanOutcome[]> {
  const now = Date.now();
  const rollCall = await getOrCreateActiveRollCall(db, now);
  const curfewAtMs = Date.parse(rollCall.curfewAt);
  const checkpointIds = new Set((await db.query<{ id: string }>(`select id from checkpoints`)).map((c) => c.id));
  const outcomes: ScanOutcome[] = [];

  for (const scan of scans) {
    const existing = await findExisting(db, scan.clientId);
    if (existing) {
      outcomes.push(existing);
      continue;
    }

    const scannedAt = Math.min(Math.max(scan.scannedAt, now - DAY_MS), now);
    const checkpointId = checkpointIds.has(scan.checkpointId) ? scan.checkpointId : null;

    // Two attempts: if another gate marked the same student present a moment ago, the unique
    // index rejects the insert and the second pass re-judges it as a duplicate.
    for (let attempt = 0; attempt < 2; attempt++) {
      const verdict = await judge(db, scan, rollCall.id, curfewAtMs, scannedAt);
      try {
        await db.query(
          `insert into scans (client_id, roll_call_id, student_id, claimed_id, checkpoint_id, scanned_by,
                              method, result, reason, scanned_at, offline)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            scan.clientId, rollCall.id, verdict.student?.id ?? null, verdict.claimedId, checkpointId, user.id,
            scan.method, verdict.result, verdict.reason, new Date(scannedAt), scan.offline,
          ],
        );
        outcomes.push({
          clientId: scan.clientId,
          result: verdict.result,
          reason: verdict.reason,
          claimedId: verdict.claimedId,
          student: verdict.student,
          scannedAt: new Date(scannedAt).toISOString(),
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 1) throw error;
        const raced = await findExisting(db, scan.clientId);
        if (raced) {
          outcomes.push(raced);
          break;
        }
      }
    }
  }
  return outcomes;
}
