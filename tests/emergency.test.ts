import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/lib/config";
import type { Db } from "../src/lib/dbcore";
import {
  activeEmergency,
  emergencyAction,
  endEmergency,
  headcount,
  headcountCsv,
  markSafety,
  scanAtAssembly,
  startEmergency,
} from "../src/lib/emergency";
import { periodAt, signPass } from "../src/lib/pass";
import { SCHEMA_SQL } from "../src/lib/schema";
import { seedDemoData } from "../src/lib/seed";

// 21:55 campus time; the fire alarm goes off just before 01:00.
const NOW = Date.UTC(2026, 8, 29, 17, 55);
const ALARM = NOW + 3 * 60 * 60_000;
const warden = { id: "admin-1", name: "Dr. Meera Nair", role: "admin" as const };
const guard = { id: "guard-1", name: "Ravi Kumar", role: "guard" as const };

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

describe("emergency headcount", () => {
  let db: Db;
  let checkedIn: string[];
  let notCheckedIn: string[];

  beforeAll(async () => {
    db = await freshDb();
    const rows = await db.query<{ id: string; present: boolean }>(
      `select st.id, exists (select 1 from scans s where s.student_id = st.id and s.result in ('valid','late','manual')
                              and s.roll_call_id = (select max(id) from roll_calls)) as present
         from students st where st.active order by st.id`,
    );
    checkedIn = rows.filter((r) => r.present).map((r) => r.id);
    notCheckedIn = rows.filter((r) => !r.present).map((r) => r.id);
  }, 60_000);

  it("only lets the warden start one", async () => {
    expect((await emergencyAction(db, guard, { action: "start", reason: "Fire alarm" })).status).toBe(403);
    const first = await startEmergency(db, warden, "Fire alarm, B-Block", ALARM);
    const again = await startEmergency(db, warden, "Something else", ALARM + 1000);
    expect(again.id).toBe(first.id);
    expect(await activeEmergency(db)).toMatchObject({ reason: "Fire alarm, B-Block", startedBy: "Dr. Meera Nair" });
  });

  it("starts with everyone unaccounted for, and knows who is probably inside", async () => {
    const count = (await headcount(db))!;
    expect(count.summary).toMatchObject({ students: 150, safe: 0, help: 0, unaccounted: 150, likelyInside: checkedIn.length });
    // Students who checked in tonight come first: they are the rooms to check.
    expect(count.people.slice(0, checkedIn.length).every((p) => p.likelyInside)).toBe(true);
  });

  it("counts students who say they're safe, scans at the assembly point, and staff marking", async () => {
    const emergency = (await activeEmergency(db))!;
    await markSafety(db, emergency.id, checkedIn[0], "safe", "self", checkedIn[0], ALARM + 60_000);
    await markSafety(db, emergency.id, checkedIn[1], "help", "self", checkedIn[1], ALARM + 70_000);
    const scan = await scanAtAssembly(db, guard, signPass(checkedIn[2], periodAt(ALARM + 90_000), config.qrSigningKey), ALARM + 90_000);
    expect(scan).toMatchObject({ ok: true, student: { id: checkedIn[2] } });
    await markSafety(db, emergency.id, notCheckedIn[0], "safe", "staff", guard.id, ALARM + 100_000);

    const count = (await headcount(db))!;
    expect(count.summary).toMatchObject({ safe: 3, help: 1, unaccounted: 146, likelyInside: checkedIn.length - 3 });
    expect(count.people[0]).toMatchObject({ status: "help", student: { id: checkedIn[1] } });
    expect(count.people.find((p) => p.student.id === checkedIn[2])).toMatchObject({ status: "safe", method: "scan", by: "Ravi Kumar" });
  });

  it("doesn't count an old screenshot of a pass at the assembly point", async () => {
    const old = signPass(checkedIn[3], periodAt(ALARM) - 10, config.qrSigningKey);
    const scan = await scanAtAssembly(db, guard, old, ALARM + 120_000);
    expect(scan.ok).toBe(false);
    expect((await headcount(db))!.people.find((p) => p.student.id === checkedIn[3])!.status).toBe("unaccounted");
  });

  it("lets someone who asked for help be marked safe later", async () => {
    const emergency = (await activeEmergency(db))!;
    await markSafety(db, emergency.id, checkedIn[1], "safe", "staff", guard.id, ALARM + 300_000);
    expect((await headcount(db))!.summary.help).toBe(0);
  });

  it("exports the list and keeps it after the headcount ends", async () => {
    const id = (await activeEmergency(db))!.id;
    const csv = headcountCsv((await headcount(db))!);
    expect(csv.split(/\r?\n/)[0]).toBe("Status,Likely inside,Student ID,Name,Hostel,Room,Time,How,Recorded by");
    expect(await endEmergency(db, warden, ALARM + 30 * 60_000)).toBe(true);
    expect(await activeEmergency(db)).toBeNull();
    expect((await headcount(db, id))!.summary.safe).toBe(4);
    const [log] = await db.query<{ detail: string }>(`select detail from audit_log where action = 'end_emergency'`);
    expect(log.detail).toContain("4 safe");
  });
});
