/** Database pieces shared by the server (db.ts) and the in-browser demo. */
import { SCHEMA_SQL } from "./schema";
import { seedDemoData } from "./seed";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

/** Creates the tables and, on an empty database, loads the demo data. */
export async function prepareDb(db: Db): Promise<void> {
  await db.exec(SCHEMA_SQL);
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from students");
  if (count === 0) await seedDemoData(db);
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
