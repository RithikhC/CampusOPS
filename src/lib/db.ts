/**
 * Database access. Uses Postgres when DATABASE_URL is set (Neon, Supabase, RDS, etc.),
 * otherwise an embedded Postgres (PGlite) stored in ./.data, so the app runs with no setup.
 * Both speak the same SQL, so there is one schema and one set of queries.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";
import { seedDemoData } from "./seed";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

const globalForDb = globalThis as unknown as { __nightpassDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__nightpassDb ??= open().catch((error) => {
    globalForDb.__nightpassDb = undefined;
    throw error;
  });
  return globalForDb.__nightpassDb;
}

async function open(): Promise<Db> {
  const db = process.env.DATABASE_URL ? await openPostgres(process.env.DATABASE_URL) : await openPglite();
  await db.exec(SCHEMA_SQL);
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from students");
  if (count === 0) await seedDemoData(db);
  return db;
}

async function openPostgres(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({ connectionString, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };
}

async function openPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  // Serverless hosts only allow writes to /tmp. Data there is per-instance and temporary, so set
  // DATABASE_URL for anything beyond a quick preview.
  const fallbackDir = process.env.VERCEL ? "/tmp/nightpass-pglite" : path.join(process.cwd(), ".data", "pglite");
  const dataDir = process.env.PGLITE_DIR ?? fallbackDir;
  await mkdir(path.dirname(dataDir), { recursive: true });
  const pg = await PGlite.create(dataDir);
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pg.query<T>(sql, params);
      return result.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
