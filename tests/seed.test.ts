import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { prepareDb, type Db } from "../src/lib/dbcore";
import { findActiveRollCall } from "../src/lib/rollcall";
import { DEMO_STUDENT_IDS, seedDemoData } from "../src/lib/seed";
import { SCHEMA_SQL } from "../src/lib/schema";

async function freshDb(): Promise<Db> {
  const pg = await PGlite.create();
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
  };
}

// Campus time is UTC+4. These cover evening, after midnight and daytime.
const MOMENTS = {
  "21:55": Date.UTC(2026, 8, 29, 17, 55),
  "01:10": Date.UTC(2026, 8, 29, 21, 10),
  "14:00": Date.UTC(2026, 8, 30, 10, 0),
};

describe("demo data", () => {
  for (const [label, nowMs] of Object.entries(MOMENTS)) {
    it(`gives one clean roll call for tonight when seeded at ${label}`, async () => {
      const db = await freshDb();
      await db.exec(SCHEMA_SQL);
      await seedDemoData(db, nowMs);

      const rollCalls = await db.query<{ starts_at: Date; ends_at: Date }>(`select starts_at, ends_at from roll_calls order by starts_at`);
      expect(rollCalls).toHaveLength(7);
      for (let i = 1; i < rollCalls.length; i++) {
        expect(new Date(rollCalls[i].starts_at).getTime()).toBeGreaterThanOrEqual(new Date(rollCalls[i - 1].ends_at).getTime());
      }

      const tonight = await findActiveRollCall(db, nowMs);
      expect(tonight).not.toBeNull();
      const [{ count }] = await db.query<{ count: number }>(
        `select count(*)::int as count from scans where roll_call_id = $1 and student_id = any($2::text[])`,
        [tonight!.id, DEMO_STUDENT_IDS],
      );
      expect(count).toBe(0);
    }, 60_000);
  }

  it("prepareDb only seeds an empty database", async () => {
    const db = await freshDb();
    await prepareDb(db);
    await prepareDb(db);
    const [{ count }] = await db.query<{ count: number }>(`select count(*)::int as count from students`);
    expect(count).toBe(150);
  }, 60_000);
});
