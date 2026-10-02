import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/lib/config";
import type { Db } from "../src/lib/dbcore";
import { fromHex } from "../src/lib/pass";
import { roomCheckIn } from "../src/lib/roomcheck";
import { readRoomTag, signRoomTag } from "../src/lib/roomtag";
import { buildRounds, recordVisit } from "../src/lib/rounds";
import { SCHEMA_SQL } from "../src/lib/schema";
import { seedDemoData } from "../src/lib/seed";

// 21:55 campus time; tonight's curfew is 22:30.
const NOW = Date.UTC(2026, 8, 29, 17, 55);
const AFTER_CURFEW = NOW + 50 * 60_000;
const AARAV = { id: "2024A7PS0112U", hostel: "A-Block", room: "A-214" };
const warden = { id: "admin-1", name: "Dr. Meera Nair", role: "admin" as const };
const tag = (hostel: string, room: string) => signRoomTag(hostel, room, config.qrSigningKey);

async function freshDb(): Promise<Db> {
  const pg = await PGlite.create();
  const db: Db = {
    query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
  };
  await db.exec(SCHEMA_SQL);
  await seedDemoData(db, NOW);
  return db;
}

describe("room tags", () => {
  const publicKey = fromHex(config.qrPublicKeyHex);

  it("round-trips a signed tag", () => {
    expect(readRoomTag(tag("A-Block", "A-214"), publicKey)).toEqual({ hostel: "A-Block", room: "A-214" });
  });

  it("rejects a tag someone made themselves", () => {
    const forged = signRoomTag("A-Block", "A-214", new Uint8Array(32).fill(3));
    expect(readRoomTag(forged, publicKey)).toBeNull();
    expect(readRoomTag("NR1.abc.def", publicKey)).toBeNull();
    expect(readRoomTag("https://example.com", publicKey)).toBeNull();
  });
});

describe("room check-in", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  }, 60_000);

  const good = { tag: tag(AARAV.hostel, AARAV.room), deviceId: "aarav-phone", onCampus: true };

  it("is closed long before curfew", async () => {
    const outcome = await roomCheckIn(db, AARAV.id, good, NOW - 3 * 60 * 60_000);
    expect(outcome).toMatchObject({ ok: false, result: "closed" });
  });

  it("refuses a check-in from outside the hostel network", async () => {
    const outcome = await roomCheckIn(db, AARAV.id, { ...good, onCampus: false }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
    expect(outcome.message).toMatch(/hostel Wi-Fi/);
  });

  it("refuses the tag of another room", async () => {
    const outcome = await roomCheckIn(db, AARAV.id, { ...good, tag: tag("B-Block", "B-108") }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
    expect(outcome.message).toContain("A-214");
  });

  it("refuses something that isn't a room tag", async () => {
    const outcome = await roomCheckIn(db, AARAV.id, { ...good, tag: "hello" }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
  });

  it("accepts the right phone, room and network, and registers the phone", async () => {
    const outcome = await roomCheckIn(db, AARAV.id, good, NOW);
    expect(outcome).toMatchObject({ ok: true, result: "valid" });
    const [device] = await db.query<{ device_id: string }>(`select device_id from student_devices where student_id = $1`, [AARAV.id]);
    expect(device.device_id).toBe("aarav-phone");
  });

  it("does nothing the second time", async () => {
    expect(await roomCheckIn(db, AARAV.id, good, NOW)).toMatchObject({ ok: true, result: "already" });
  });

  it("refuses a different phone for a student who already has one registered", async () => {
    const [student] = await db.query<{ id: string; hostel: string; room: string }>(
      `select st.id, st.hostel, st.room from students st join student_devices d on d.student_id = st.id
        where not exists (select 1 from scans s where s.student_id = st.id and s.roll_call_id = (select max(id) from roll_calls)
                                                  and s.result in ('valid', 'late', 'manual'))
        limit 1`,
    );
    const outcome = await roomCheckIn(db, student.id, { tag: tag(student.hostel, student.room), deviceId: "friends-phone", onCampus: true }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
    expect(outcome.message).toMatch(/phone registered/);
  });

  it("marks a check-in after curfew as late", async () => {
    const outcome = await roomCheckIn(db, "2023A3PS0048U", { tag: tag("B-Block", "B-108"), deviceId: "fatima-phone", onCampus: true }, AFTER_CURFEW);
    expect(outcome).toMatchObject({ ok: true, result: "late" });
  });
});

describe("warden's rounds", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
    await roomCheckIn(db, AARAV.id, { tag: tag(AARAV.hostel, AARAV.room), deviceId: "aarav-phone", onCampus: true }, NOW);
  }, 60_000);

  it("lists far fewer rooms than students, and never someone a guard scanned at the gate", async () => {
    const rounds = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    expect(rounds.curfewPassed).toBe(true);
    expect(rounds.summary.students).toBe(150);
    expect(rounds.summary.toVisit).toBeLessThan(90);
    expect(rounds.summary.toVisit + rounds.summary.noVisitNeeded).toBe(150);

    const gateScanned = await db.query<{ student_id: string }>(
      `select student_id from scans where roll_call_id = $1 and method = 'qr' and result in ('valid', 'late')`,
      [rounds.rollCall.id],
    );
    const listed = new Set(rounds.items.map((i) => i.student.id));
    expect(gateScanned.some((g) => listed.has(g.student_id))).toBe(false);
  });

  it("spot-checks a student who registered a new phone tonight", async () => {
    const rounds = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    const aarav = rounds.items.find((i) => i.student.id === AARAV.id);
    expect(aarav?.kind).toBe("spot");
    expect(aarav?.reasons).toContain("New phone registered tonight");
  });

  it("puts students with no check-in on the list, in room order within a block", async () => {
    const rounds = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    expect(rounds.items.some((i) => i.kind === "missing")).toBe(true);
    const blockA = rounds.items.filter((i) => i.student.hostel === "A-Block").map((i) => i.student.room);
    expect(blockA).toEqual([...blockA].sort(new Intl.Collator("en", { numeric: true }).compare));
  });

  it("cancels a room check-in when the warden finds the room empty", async () => {
    await recordVisit(db, warden, AARAV.id, "absent", AFTER_CURFEW);
    const scans = await db.query<{ result: string; reason: string }>(
      `select result, reason from scans where student_id = $1 and roll_call_id = (select max(id) from roll_calls)`,
      [AARAV.id],
    );
    expect(scans).toHaveLength(1);
    expect(scans[0].result).toBe("absent");
    expect(scans[0].reason).toMatch(/not there during rounds/);

    const rounds = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    const aarav = rounds.items.find((i) => i.student.id === AARAV.id);
    expect(aarav).toMatchObject({ kind: "missing", visit: { outcome: "absent" } });
  });

  it("marks a student present when the warden sees them in the room", async () => {
    const before = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    const missing = before.items.find((i) => i.kind === "missing" && !i.visit)!;
    await recordVisit(db, warden, missing.student.id, "present", AFTER_CURFEW);

    const after = (await buildRounds(db, undefined, AFTER_CURFEW))!;
    expect(after.summary.checkedIn).toBe(before.summary.checkedIn + 1);
    expect(after.items.find((i) => i.student.id === missing.student.id)?.visit?.outcome).toBe("present");
    const [scan] = await db.query<{ method: string; result: string }>(
      `select method, result from scans where student_id = $1 and roll_call_id = $2 and result = 'valid'`,
      [missing.student.id, after.rollCall.id],
    );
    expect(scan.method).toBe("round");
  });
});
