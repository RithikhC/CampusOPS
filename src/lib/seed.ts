/**
 * Demo data: 150 students across three hostel blocks, gates, staff, tonight's roll call already
 * in progress (with a few flagged entries to follow up), and six previous nights for reports.
 * Deterministic, so every reset produces the same people.
 */
import type { Db } from "./db";
import { defaultRollCallWindow, DEFAULT_CURFEW, insertRollCall } from "./rollcall";
import { campusTime, formatClock, formatDate } from "./time";
import type { ScanResult } from "./verify";

/** Students offered on the demo login screen. They start tonight "not yet checked in". */
export const DEMO_STUDENT_IDS = ["2024A7PS0112U", "2023A3PS0048U", "2022B4PS0217U"];

export const DEMO_STAFF = [
  { id: "admin-1", name: "Dr. Meera Nair", email: "warden@campus.demo", role: "admin", title: "Chief Warden" },
  { id: "guard-1", name: "Ravi Kumar", email: "ravi.security@campus.demo", role: "guard", title: "Night Security" },
  { id: "guard-2", name: "Suresh Babu", email: "suresh.security@campus.demo", role: "guard", title: "Night Security" },
  { id: "guard-3", name: "Anil Joseph", email: "anil.security@campus.demo", role: "guard", title: "Night Security" },
] as const;

const HOSTELS = ["A-Block", "B-Block", "C-Block"];
const CHECKPOINTS = [
  { id: "gate-a", name: "A-Block Gate", hostel: "A-Block", guard: "guard-1" },
  { id: "gate-b", name: "B-Block Gate", hostel: "B-Block", guard: "guard-2" },
  { id: "gate-c", name: "C-Block Gate", hostel: "C-Block", guard: "guard-3" },
  { id: "main", name: "Main Gate", hostel: null, guard: "guard-1" },
];

const FIRST = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Ishaan", "Karan", "Siddharth", "Varun", "Yash", "Omar",
  "Ahmed", "Hamdan", "Khalid", "Yousef", "Bilal", "Hassan", "Faisal", "Imran", "Priya", "Ananya",
  "Diya", "Isha", "Kavya", "Nisha", "Riya", "Sneha", "Tanvi", "Aisha", "Mariam", "Noor", "Sara",
  "Layla", "Hiba", "Zainab", "Sana", "Daniel", "Joel", "Nikhil", "Rahul", "Kevin", "Ali", "Hamza",
  "Ayaan", "Neha", "Pooja", "Aditi", "Shreya", "Zoya", "Reem", "Dev",
];
const LAST = [
  "Sharma", "Iyer", "Nair", "Menon", "Reddy", "Rao", "Gupta", "Kapoor", "Singh", "Verma", "Joshi",
  "Patel", "Shah", "Khan", "Qureshi", "Siddiqui", "Al Hashimi", "Al Nuaimi", "Al Suwaidi", "Haddad",
  "Farouk", "D'Souza", "Fernandes", "Thomas", "George", "Varghese", "Kurian", "Chatterjee", "Bose",
  "Das", "Malik", "Rizvi", "Mathew", "Krishnan", "Bhat",
];
const BRANCHES = ["A7", "A3", "A4", "A8", "AA", "B4", "B1"];
const MANUAL_REASONS = ["Phone battery dead", "Forgot phone in lab", "Cracked screen, QR unreadable"];

interface SeedStudent {
  id: string;
  name: string;
  email: string;
  hostel: string;
  room: string;
}

interface SeedScan {
  clientId: string;
  rollCallId: number;
  studentId: string | null;
  claimedId: string | null;
  checkpointId: string;
  scannedBy: string;
  method: "qr" | "manual";
  result: ScanResult;
  reason: string;
  scannedAt: number;
  offline: boolean;
  resolved?: { note: string; by: string };
}

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStudents(random: () => number): SeedStudent[] {
  const featured: SeedStudent[] = [
    { id: DEMO_STUDENT_IDS[0], name: "Aarav Mehta", email: "aarav.mehta@campus.demo", hostel: "A-Block", room: "A-214" },
    { id: DEMO_STUDENT_IDS[1], name: "Fatima Al Mansoori", email: "fatima.almansoori@campus.demo", hostel: "B-Block", room: "B-108" },
    { id: DEMO_STUDENT_IDS[2], name: "Rohan Pillai", email: "rohan.pillai@campus.demo", hostel: "C-Block", room: "C-305" },
  ];
  const students = [...featured];
  const ids = new Set(students.map((s) => s.id));
  const names = new Set(students.map((s) => s.name));

  while (students.length < 150) {
    const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`;
    const year = 2022 + Math.floor(random() * 4);
    const id = `${year}${BRANCHES[Math.floor(random() * BRANCHES.length)]}PS${String(Math.floor(random() * 900) + 10).padStart(4, "0")}U`;
    if (ids.has(id) || names.has(name)) continue;
    const hostel = HOSTELS[students.length % HOSTELS.length];
    const room = `${hostel[0]}-${1 + Math.floor(random() * 3)}${String(1 + Math.floor(random() * 30)).padStart(2, "0")}`;
    const email = `${name.toLowerCase().replace(/[^a-z ]/g, "").replace(/ +/g, ".")}${students.length}@campus.demo`;
    ids.add(id);
    names.add(name);
    students.push({ id, name, email, hostel, room });
  }
  return students;
}

function gateFor(student: SeedStudent, random: () => number) {
  if (random() < 0.15) return CHECKPOINTS[3];
  return CHECKPOINTS.find((c) => c.hostel === student.hostel) ?? CHECKPOINTS[3];
}

/** Scans for one roll call: most students arrive before curfew, a few late, some flagged. */
function buildNight(
  rollCallId: number,
  students: SeedStudent[],
  random: () => number,
  opts: { fromMs: number; toMs: number; curfewMs: number; attendance: number; flags: boolean; prefix: string },
): SeedScan[] {
  const scans: SeedScan[] = [];
  const presentAt = new Map<string, { at: number; gate: string }>();
  const eligible = students.filter((s) => !DEMO_STUDENT_IDS.includes(s.id));
  const span = Math.max(opts.toMs - opts.fromMs, 60_000);
  const onTimeEnd = Math.max(Math.min(opts.curfewMs, opts.toMs), opts.fromMs + 60_000);
  const lateEnd = Math.min(opts.toMs, opts.curfewMs + 40 * 60_000);
  let manualLeft = opts.flags ? MANUAL_REASONS.length : 1;

  for (const student of eligible) {
    if (random() > opts.attendance) continue;
    // Most arrive before curfew, skewed toward it like real evenings; a few straggle in late.
    const late = lateEnd > opts.curfewMs && random() < 0.06;
    const scannedAt = late
      ? Math.round(opts.curfewMs + (lateEnd - opts.curfewMs) * random())
      : Math.round(opts.fromMs + (onTimeEnd - opts.fromMs) * Math.sqrt(random()));
    const gate = gateFor(student, random);
    const manual = manualLeft > 0 && random() < 0.04;
    let result: ScanResult = "valid";
    let reason = "Checked in";
    if (manual) {
      result = "manual";
      reason = `Manual entry: ${MANUAL_REASONS[--manualLeft % MANUAL_REASONS.length]}`;
    } else if (scannedAt > opts.curfewMs) {
      result = "late";
      reason = `${Math.ceil((scannedAt - opts.curfewMs) / 60_000)} min after curfew`;
    }
    presentAt.set(student.id, { at: scannedAt, gate: gate.name });
    scans.push({
      clientId: `${opts.prefix}-${scans.length}`,
      rollCallId,
      studentId: student.id,
      claimedId: student.id,
      checkpointId: gate.id,
      scannedBy: gate.guard,
      method: manual ? "manual" : "qr",
      result,
      reason,
      scannedAt,
      offline: gate.id === "gate-c" && random() < 0.3,
    });
  }

  if (!opts.flags) return scans;

  const present = eligible.filter((s) => presentAt.has(s.id));
  const absent = eligible.filter((s) => !presentAt.has(s.id));
  const pick = <T,>(list: T[]) => list.splice(Math.floor(random() * list.length), 1)[0];
  const later = (ms: number) => Math.round(ms + (opts.toMs - ms) * (0.2 + random() * 0.8));

  // Same student scanned again (e.g. walked out and back, or a shared screenshot).
  for (let i = 0; i < 4 && present.length; i++) {
    const student = pick(present);
    const first = presentAt.get(student.id)!;
    const gate = CHECKPOINTS[Math.floor(random() * CHECKPOINTS.length)];
    scans.push({
      clientId: `${opts.prefix}-dup-${i}`,
      rollCallId,
      studentId: student.id,
      claimedId: student.id,
      checkpointId: gate.id,
      scannedBy: gate.guard,
      method: "qr",
      result: "duplicate",
      reason: `Already checked in at ${formatClock(first.at)} · ${first.gate}`,
      scannedAt: later(first.at),
      offline: false,
      resolved: i === 0 ? { note: "Student stepped out to collect a delivery; verified by guard.", by: "admin-1" } : undefined,
    });
  }

  // Proxy attempts: a friend shows a screenshot of an absent student's pass.
  for (let i = 0; i < 2 && absent.length; i++) {
    const student = pick(absent);
    const gate = gateFor(student, random);
    scans.push({
      clientId: `${opts.prefix}-exp-${i}`,
      rollCallId,
      studentId: student.id,
      claimedId: student.id,
      checkpointId: gate.id,
      scannedBy: gate.guard,
      method: "qr",
      result: "expired",
      reason: `Code is ${3 + i * 4} min old. Possible screenshot; ask for the live pass`,
      scannedAt: Math.round(opts.fromMs + span * (0.5 + random() * 0.45)),
      offline: false,
    });
  }

  scans.push(
    {
      clientId: `${opts.prefix}-inv-0`,
      rollCallId,
      studentId: null,
      claimedId: null,
      checkpointId: "main",
      scannedBy: "guard-1",
      method: "qr",
      result: "invalid",
      reason: "Not a NightPass code",
      scannedAt: Math.round(opts.fromMs + span * 0.7),
      offline: false,
    },
    {
      clientId: `${opts.prefix}-unk-0`,
      rollCallId,
      studentId: null,
      claimedId: "2019A7PS0999U",
      checkpointId: "gate-b",
      scannedBy: "guard-2",
      method: "qr",
      result: "unknown",
      reason: "ID is not on the active roster",
      scannedAt: Math.round(opts.fromMs + span * 0.8),
      offline: false,
    },
  );

  const firstManual = scans.find((s) => s.result === "manual");
  if (firstManual) firstManual.resolved = { note: "Identity confirmed against ID card photo.", by: "admin-1" };

  return scans;
}

async function insertMany(db: Db, table: string, columns: string[], rows: unknown[][]) {
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = slice.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await db.query(`insert into ${table} (${columns.join(", ")}) values ${values.join(", ")}`, params);
  }
}

async function insertScans(db: Db, scans: SeedScan[]) {
  await insertMany(
    db,
    "scans",
    [
      "client_id", "roll_call_id", "student_id", "claimed_id", "checkpoint_id", "scanned_by", "method",
      "result", "reason", "scanned_at", "received_at", "offline", "resolved_at", "resolved_by", "resolution_note",
    ],
    scans.map((s) => [
      s.clientId, s.rollCallId, s.studentId, s.claimedId, s.checkpointId, s.scannedBy, s.method,
      s.result, s.reason, new Date(s.scannedAt),
      new Date(s.offline ? s.scannedAt + 4 * 60_000 : s.scannedAt + 400),
      s.offline,
      s.resolved ? new Date(s.scannedAt + 25 * 60_000) : null,
      s.resolved?.by ?? null,
      s.resolved?.note ?? null,
    ]),
  );
}

export async function seedDemoData(db: Db, nowMs = Date.now()): Promise<void> {
  const random = prng(2026);
  const students = buildStudents(random);

  await insertMany(db, "staff", ["id", "name", "email", "role", "title"], DEMO_STAFF.map((s) => [s.id, s.name, s.email, s.role, s.title]));
  await insertMany(db, "checkpoints", ["id", "name", "hostel"], CHECKPOINTS.map((c) => [c.id, c.name, c.hostel]));
  await insertMany(db, "students", ["id", "name", "email", "hostel", "room"], students.map((s) => [s.id, s.name, s.email, s.hostel, s.room]));

  // Six previous nights, for trends and date-range reports.
  for (let daysAgo = 6; daysAgo >= 1; daysAgo--) {
    const startsAt = campusTime(nowMs, 18, 0, -daysAgo);
    const curfewAt = campusTime(nowMs, DEFAULT_CURFEW.hours, DEFAULT_CURFEW.minutes, -daysAgo);
    const rollCall = await insertRollCall(
      db,
      { name: `Night roll call · ${formatDate(startsAt)}`, startsAt, endsAt: campusTime(nowMs, 6, 0, 1 - daysAgo), curfewAt },
      "system",
    );
    await insertScans(
      db,
      buildNight(rollCall.id, students, random, {
        fromMs: curfewAt - 3.5 * 60 * 60_000,
        toMs: curfewAt + 50 * 60_000,
        curfewMs: curfewAt,
        attendance: 0.9 + random() * 0.08,
        flags: daysAgo <= 2,
        prefix: `seed-d${daysAgo}`,
      }),
    );
  }

  // Tonight, in progress.
  const window = defaultRollCallWindow(nowMs);
  const tonight = await insertRollCall(db, window, "system");
  await insertScans(
    db,
    buildNight(tonight.id, students, random, {
      fromMs: Math.max(window.startsAt, nowMs - 100 * 60_000),
      toMs: nowMs - 60_000,
      curfewMs: window.curfewAt,
      attendance: 0.68,
      flags: true,
      prefix: "seed-tonight",
    }),
  );

  await db.query(`insert into audit_log (actor, action, detail) values ('system', 'seed', 'Demo data loaded')`);
}

export async function resetDemoData(db: Db): Promise<void> {
  await db.exec(`truncate scans, roll_calls, students, staff, checkpoints, audit_log restart identity cascade`);
  await seedDemoData(db);
}
