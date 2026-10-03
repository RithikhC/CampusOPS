/**
 * The GitHub Pages demo has no server, so the API runs in the browser instead. It uses the same
 * data functions as the real server (queries, scans, admin) on top of PGlite, which is Postgres
 * compiled to WebAssembly. Every visitor gets their own fresh copy of the demo data.
 */
import { importRoster, listRoomTags, resolveFlag, setCurfew, startNewRollCall } from "@/lib/admin";
import { config } from "@/lib/config";
import { toCsv } from "@/lib/csv";
import { activeEmergency, emergencyAction, headcount, headcountCsv, markSafety } from "@/lib/emergency";
import { prepareDb, type Db } from "@/lib/dbcore";
import { periodAt, signPass } from "@/lib/pass";
import { adminOverview, filtersFromSearchParams, guardBootstrap, searchRecords, studentPass } from "@/lib/queries";
import { roomCheckIn } from "@/lib/roomcheck";
import { signRoomTag } from "@/lib/roomtag";
import { buildRounds, recordVisit } from "@/lib/rounds";
import { parseIncomingScans, recordScans } from "@/lib/scans";
import { resetDemoData, type SeedOptions } from "@/lib/seed";
import type { Role, SessionUser } from "@/lib/session";
import { formatClock, formatDate } from "@/lib/time";
import { RESULT_META } from "@/lib/verify";
import { parsePasskeyProof } from "@/lib/webauthn";

const PGLITE_CDN = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist";
/** The demo's roll call always runs "now", with curfew a little way off, whatever time it is opened. */
const SEED: SeedOptions = { curfewInMinutes: 25, registerDemoPhones: true };

export interface ApiResult {
  status: number;
  contentType: string;
  body: string;
}

export interface DemoBackend {
  handle(user: SessionUser, method: string, url: string, body: string | null): Promise<ApiResult>;
  /** The code a student's phone is showing right now, or `periodsAgo` periods ago (an old screenshot). */
  passCode(studentId: string, periodsAgo?: number): string;
  /** The tag stuck inside a student's room. */
  roomTag(studentId: string): Promise<string>;
  /** The tag of any room (e.g. the room next door). */
  roomTagFor(hostel: string, room: string): string;
  reset(): Promise<void>;
}

interface Pg {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

// Loaded at runtime from a CDN so the bundler doesn't have to package the WebAssembly files.
const importFromUrl = new Function("url", "return import(url)") as (url: string) => Promise<{
  PGlite: { create(): Promise<Pg> };
}>;

// Runs in the page. (PGlite's worker mode was tried: it made every query 7-10x slower.)
async function openPglite(): Promise<Pg> {
  const { PGlite } = await importFromUrl(`${PGLITE_CDN}/index.js`);
  return PGlite.create();
}

export async function createBackend(): Promise<DemoBackend> {
  const pg = await openPglite();
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
  await prepareDb(db, SEED);

  return {
    handle: (user, method, url, body) => route(db, user, method, url, body).catch((error: Error) => json(500, { error: error.message })),
    passCode: (studentId, periodsAgo = 0) => signPass(studentId, periodAt(Date.now()) - periodsAgo, config.qrSigningKey),
    roomTag: async (studentId) => {
      const [student] = await db.query<{ hostel: string; room: string }>(`select hostel, room from students where id = $1`, [studentId]);
      return signRoomTag(student.hostel, student.room, config.qrSigningKey);
    },
    roomTagFor: (hostel, room) => signRoomTag(hostel, room, config.qrSigningKey),
    reset: () => resetDemoData(db, SEED),
  };
}

function json(status: number, data: unknown): ApiResult {
  return { status, contentType: "application/json", body: JSON.stringify(data) };
}

function allowed(user: SessionUser, roles: Role[]): boolean {
  return roles.includes(user.role);
}

async function route(db: Db, user: SessionUser, method: string, rawUrl: string, rawBody: string | null): Promise<ApiResult> {
  const url = new URL(rawUrl, "https://demo.local");
  const path = url.pathname.replace(/\/+$/, "");
  const body = rawBody ? JSON.parse(rawBody) : {};
  const forbidden = json(403, { error: "Not allowed for your role" });

  if (path === "/api/auth/logout" || path === "/api/auth/login") return json(200, { redirect: "/" });

  if (path === "/api/student/pass" && method === "GET") {
    if (!allowed(user, ["student"])) return forbidden;
    const pass = await studentPass(db, user.id);
    return pass ? json(200, pass) : json(404, { error: "Your pass is not active" });
  }

  if (path === "/api/student/checkin" && method === "POST") {
    if (!allowed(user, ["student"])) return forbidden;
    // There is no real network to check in the browser demo, so the demo page says where the phone "is".
    const outcome = await roomCheckIn(db, user.id, {
      tag: String(body.tag ?? ""),
      deviceId: String(body.deviceId ?? ""),
      onCampus: !body.simulateOffCampus,
      challenge: typeof body.challenge === "string" ? body.challenge : undefined,
      passkey: parsePasskeyProof(body.passkey),
      passkeyFailed: body.passkeyFailed === true,
      site: { origin: window.location.origin, rpId: window.location.hostname },
    });
    return json(200, outcome);
  }

  if (path === "/api/student/safety" && method === "POST") {
    if (!allowed(user, ["student"])) return forbidden;
    const emergency = await activeEmergency(db);
    if (!emergency) return json(409, { error: "There is no headcount running" });
    if (body.status !== "safe" && body.status !== "help") return json(400, { error: "Choose safe or help" });
    await markSafety(db, emergency.id, user.id, body.status, "self", user.id);
    return json(200, { ok: true });
  }

  if (path === "/api/emergency") {
    if (!allowed(user, ["guard", "admin"])) return forbidden;
    if (method === "GET") return json(200, (await headcount(db)) ?? { emergency: null });
    const result = await emergencyAction(db, user, body);
    return json(result.status, result.body);
  }

  if (path === "/api/guard/rounds") {
    if (!allowed(user, ["guard", "admin"])) return forbidden;
    if (method === "POST") {
      const outcome = body.outcome === "absent" ? "absent" : "present";
      if (!(await recordVisit(db, user, String(body.studentId ?? ""), outcome))) return json(404, { error: "Student not found" });
    }
    return json(200, await buildRounds(db));
  }

  if (path === "/api/guard/bootstrap" && method === "GET") {
    if (!allowed(user, ["guard", "admin"])) return forbidden;
    return json(200, await guardBootstrap(db));
  }

  if (path === "/api/scans" && method === "POST") {
    if (!allowed(user, ["guard", "admin"])) return forbidden;
    const scans = parseIncomingScans(body);
    if (!scans) return json(400, { error: "Malformed scan batch" });
    return json(200, { results: await recordScans(db, user, scans) });
  }

  if (!path.startsWith("/api/admin/")) return json(404, { error: "Not found" });
  if (!allowed(user, ["admin"])) return forbidden;

  const rollCallParam = Number(url.searchParams.get("rollCallId"));
  const rollCallId = Number.isInteger(rollCallParam) && rollCallParam > 0 ? rollCallParam : undefined;

  if (path === "/api/admin/overview") {
    const overview = await adminOverview(db, rollCallId);
    return overview ? json(200, overview) : json(404, { error: "Roll call not found" });
  }

  if (path === "/api/admin/records") {
    return json(200, { records: await searchRecords(db, filtersFromSearchParams(url.searchParams)) });
  }

  if (path === "/api/admin/export") {
    let csv: string;
    if (url.searchParams.get("kind") === "headcount") {
      const id = Number(url.searchParams.get("emergencyId"));
      const count = await headcount(db, Number.isInteger(id) && id > 0 ? id : undefined);
      if (!count) return json(404, { error: "No headcount found" });
      csv = headcountCsv(count);
    } else if (url.searchParams.get("kind") === "missing") {
      const overview = await adminOverview(db, rollCallId);
      csv = toCsv(
        ["Student ID", "Name", "Hostel", "Room", "Email", "Last attempt", "Attempt time", "Attempt detail"],
        (overview?.missing ?? []).map((m) => [
          m.id, m.name, m.hostel, m.room, m.email,
          m.lastAttempt ? RESULT_META[m.lastAttempt.result].label : "",
          m.lastAttempt ? formatClock(m.lastAttempt.at) : "",
          m.lastAttempt?.reason ?? "",
        ]),
      );
    } else {
      const records = await searchRecords(db, { ...filtersFromSearchParams(url.searchParams), limit: 10_000 });
      csv = toCsv(
        ["Date", "Time", "Roll call", "Student ID", "Name", "Hostel", "Room", "Where", "Method", "Result", "Detail",
          "Scanned by", "Recorded offline", "Resolved by", "Resolution note"],
        records.map((r) => [
          formatDate(r.scannedAt), formatClock(r.scannedAt, true), r.rollCall, r.studentId ?? r.claimedId ?? "",
          r.studentName ?? "", r.hostel ?? "", r.room ?? "", r.checkpoint ?? "", r.method, RESULT_META[r.result].label,
          r.reason, r.scannedBy ?? "", r.offline ? "yes" : "no", r.resolvedBy ?? "", r.resolutionNote ?? "",
        ]),
      );
    }
    return { status: 200, contentType: "text/csv; charset=utf-8", body: `﻿${csv}` };
  }

  const flag = /^\/api\/admin\/flags\/(\d+)$/.exec(path);
  if (flag && method === "POST") {
    const ok = await resolveFlag(db, user, Number(flag[1]), String(body.note ?? "").slice(0, 500));
    return ok ? json(200, { ok: true }) : json(409, { error: "Already resolved or not a flag" });
  }

  if (path === "/api/admin/rollcall" && method === "POST") {
    if (body.action === "new") return json(200, { rollCall: await startNewRollCall(db, user) });
    if (body.action === "curfew") {
      const rollCall = await setCurfew(db, user, Number(body.rollCallId), String(body.time));
      return rollCall ? json(200, { rollCall }) : json(400, { error: "Invalid time" });
    }
    return json(400, { error: "Unknown action" });
  }

  if (path === "/api/admin/roster") {
    if (method === "POST") return json(200, await importRoster(db, user, String(body.csv ?? "")));
    return json(200, { students: await db.query(`select id, name, email, hostel, room, active from students order by hostel, name`) });
  }

  if (path === "/api/admin/roomtags") return json(200, { tags: await listRoomTags(db) });

  if (path === "/api/admin/reset" && method === "POST") {
    await resetDemoData(db, SEED);
    return json(200, { ok: true });
  }

  return json(404, { error: "Not found" });
}
