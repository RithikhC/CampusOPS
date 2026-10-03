/**
 * Demo data: 150 students across three hostel blocks, gates, staff, tonight's roll call already
 * in progress (with a few flagged entries to follow up), and six previous nights for reports.
 * Deterministic, so every reset produces the same people.
 */
import type { Db } from "./dbcore";
import { demoPasskey } from "./demopasskey";
import { defaultRollCallWindow, DEFAULT_CURFEW, insertRollCall } from "./rollcall";
import { campusHour, campusTime, formatClock, formatDate } from "./time";
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
  checkpointId: string | null;
  scannedBy: string;
  method: "qr" | "manual" | "self";
  deviceId?: string;
  /** Room check-ins: confirmed with the phone's fingerprint / face check. */
  userVerified?: boolean;
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
  opts: { fromMs: number; toMs: number; curfewMs: number; attendance: number; flags: boolean; prefix: string; tonight?: boolean },
): SeedScan[] {
  const scans: SeedScan[] = [];
  const presentAt = new Map<string, { at: number; gate: string; self: boolean }>();
  // The demo students start tonight not yet checked in, so they can be scanned live.
  const eligible = opts.tonight ? students.filter((s) => !DEMO_STUDENT_IDS.includes(s.id)) : students;
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
    // Most students check in from their room; the rest are scanned by a guard at a gate.
    const self = !manual && random() < 0.62;
    const minutesLate = Math.ceil((scannedAt - opts.curfewMs) / 60_000);
    let result: ScanResult = "valid";
    const verified = self && hasFingerprintLock(student.id);
    const without = self && !verified ? ", without a fingerprint check" : "";
    let reason = self ? `Checked in from room ${student.room}${without}` : "Checked in";
    if (manual) {
      result = "manual";
      reason = `Manual entry: ${MANUAL_REASONS[--manualLeft % MANUAL_REASONS.length]}`;
    } else if (scannedAt > opts.curfewMs) {
      result = "late";
      reason = self ? `Room check-in ${minutesLate} min after curfew${without}` : `${minutesLate} min after curfew`;
    }
    presentAt.set(student.id, { at: scannedAt, gate: self ? "room check-in" : gate.name, self });
    scans.push({
      clientId: `${opts.prefix}-${scans.length}`,
      rollCallId,
      studentId: student.id,
      claimedId: student.id,
      checkpointId: self ? null : gate.id,
      scannedBy: self ? "student" : gate.guard,
      method: manual ? "manual" : self ? "self" : "qr",
      result,
      reason,
      scannedAt,
      offline: !self && gate.id === "gate-c" && random() < 0.3,
      deviceId: self ? phoneOf(student.id) : undefined,
      userVerified: self ? verified : undefined,
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

  // Room check-ins that were refused. These students end up on the warden's rounds.
  const selfAttempt = (student: SeedStudent, reason: string, scannedAt: number, deviceId = phoneOf(student.id)): SeedScan => ({
    clientId: `${opts.prefix}-self-${scans.length}`,
    rollCallId,
    studentId: student.id,
    claimedId: student.id,
    checkpointId: null,
    scannedBy: "student",
    method: "self",
    result: "invalid",
    reason,
    scannedAt,
    offline: false,
    deviceId,
  });
  if (opts.tonight) {
    for (let i = 0; i < 2 && absent.length; i++) {
      scans.push(selfAttempt(pick(absent), "Room check-in tried from outside the hostel network", Math.round(opts.fromMs + span * (0.6 + random() * 0.35))));
    }
    if (absent.length) {
      scans.push(selfAttempt(pick(absent), "Room check-in tried from a phone that isn't registered to this student", Math.round(opts.fromMs + span * 0.85), "another-phone"));
    }
    if (absent.length) {
      scans.push(selfAttempt(pick(absent), "Fingerprint or face check failed on the student's phone", Math.round(opts.fromMs + span * 0.9)));
    }
    const wrongRoom = present.find((s) => presentAt.get(s.id)!.self);
    if (wrongRoom) {
      const neighbour = `${wrongRoom.room.slice(0, -1)}${(Number(wrongRoom.room.slice(-1)) + 1) % 10}`;
      scans.push(selfAttempt(wrongRoom, `Scanned the tag for room ${neighbour}, but is assigned to room ${wrongRoom.room}`, presentAt.get(wrongRoom.id)!.at - 90_000));
    }
  }

  const firstManual = scans.find((s) => s.result === "manual");
  if (firstManual) firstManual.resolved = { note: "Identity confirmed against ID card photo.", by: "admin-1" };

  return scans;
}

/** Inserts all rows in one statement, passed as a single JSON value (much faster than thousands of parameters). */
async function insertMany(db: Db, table: string, columns: [name: string, type: string][], rows: unknown[][]) {
  if (rows.length === 0) return;
  const names = columns.map(([name]) => name);
  const records = rows.map((row) =>
    Object.fromEntries(row.map((value, i) => [names[i], value instanceof Date ? value.toISOString() : value])),
  );
  await db.query(
    `insert into ${table} (${names.join(", ")})
     select ${names.join(", ")} from json_to_recordset($1::json) as r(${columns.map(([name, type]) => `${name} ${type}`).join(", ")})`,
    [JSON.stringify(records)],
  );
}

async function insertScans(db: Db, scans: SeedScan[]) {
  await insertMany(
    db,
    "scans",
    [
      ["client_id", "text"], ["roll_call_id", "int"], ["student_id", "text"], ["claimed_id", "text"], ["checkpoint_id", "text"],
      ["scanned_by", "text"], ["method", "text"], ["result", "text"], ["reason", "text"], ["scanned_at", "timestamptz"],
      ["received_at", "timestamptz"], ["offline", "boolean"], ["resolved_at", "timestamptz"], ["resolved_by", "text"],
      ["resolution_note", "text"], ["device_id", "text"], ["user_verified", "boolean"],
    ],
    scans.map((s) => [
      s.clientId, s.rollCallId, s.studentId, s.claimedId, s.checkpointId, s.scannedBy, s.method,
      s.result, s.reason, new Date(s.scannedAt),
      new Date(s.offline ? s.scannedAt + 4 * 60_000 : s.scannedAt + 400),
      s.offline,
      s.resolved ? new Date(s.scannedAt + 25 * 60_000) : null,
      s.resolved?.by ?? null,
      s.resolved?.note ?? null,
      s.deviceId ?? null,
      s.userVerified ?? null,
    ]),
  );
}

export interface SeedOptions {
  /**
   * Run tonight's roll call "right now" with curfew this many minutes away, whatever the time of
   * day. Used by the browser demo so visitors always land in the middle of an evening.
   */
  curfewInMinutes?: number;
  /** Also register the demo students' phones (the browser demo uses fixed phone IDs for them). */
  registerDemoPhones?: boolean;
}

/** The phone each seeded student is registered with. */
export const phoneOf = (studentId: string) => `phone-${studentId}`;

/** About 1 in 12 sample phones has no fingerprint or face lock set up. Stable per student. */
function hasFingerprintLock(studentId: string): boolean {
  let hash = 7;
  for (const ch of studentId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 12 !== 0;
}

export async function seedDemoData(db: Db, nowMs = Date.now(), options: SeedOptions = {}): Promise<void> {
  const random = prng(2026);
  const students = buildStudents(random);

  const text = (...names: string[]) => names.map((name): [string, string] => [name, "text"]);
  await insertMany(db, "staff", text("id", "name", "email", "role", "title"), DEMO_STAFF.map((s) => [s.id, s.name, s.email, s.role, s.title]));
  await insertMany(db, "checkpoints", text("id", "name", "hostel"), CHECKPOINTS.map((c) => [c.id, c.name, c.hostel]));
  await insertMany(db, "students", text("id", "name", "email", "hostel", "room"), students.map((s) => [s.id, s.name, s.email, s.hostel, s.room]));
  // Everyone except the demo students already has a registered phone. The demo students register
  // theirs with their first room check-in, which puts them on tonight's spot-check list.
  // In the browser demo the demo students' phones are also set up with a (software) passkey, so
  // their check-ins ask for a fingerprint straight away.
  const passkeyFor = (s: SeedStudent) => {
    if (DEMO_STUDENT_IDS.includes(s.id)) return demoPasskey(s.id, phoneOf(s.id));
    return hasFingerprintLock(s.id) ? { credentialId: `seed-${s.id}`, publicKey: null } : null;
  };
  await insertMany(
    db,
    "student_devices",
    [["student_id", "text"], ["device_id", "text"], ["registered_at", "timestamptz"], ["credential_id", "text"], ["public_key", "text"]],
    students
      .filter((s) => options.registerDemoPhones || !DEMO_STUDENT_IDS.includes(s.id))
      .map((s) => [s.id, phoneOf(s.id), new Date(nowMs - 30 * 24 * 60 * 60_000), passkeyFor(s)?.credentialId ?? null, passkeyFor(s)?.publicKey ?? null]),
  );
  const scans: SeedScan[] = [];

  // Six previous nights, for trends and date-range reports. Count back from tonight's evening:
  // between midnight and 06:00, "tonight" started on the previous calendar day.
  const evening = campusHour(nowMs) < 6 ? campusTime(nowMs, 12, 0, -1) : nowMs;
  for (let daysAgo = 6; daysAgo >= 1; daysAgo--) {
    const startsAt = campusTime(evening, 18, 0, -daysAgo);
    const curfewAt = campusTime(evening, DEFAULT_CURFEW.hours, DEFAULT_CURFEW.minutes, -daysAgo);
    const rollCall = await insertRollCall(
      db,
      { name: `Night roll call · ${formatDate(startsAt)}`, startsAt, endsAt: campusTime(evening, 6, 0, 1 - daysAgo), curfewAt },
      "system",
    );
    scans.push(
      ...buildNight(rollCall.id, students, random, {
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
  const live = options.curfewInMinutes !== undefined;
  const window = live
    ? {
        name: `Night roll call · ${formatDate(evening)}`,
        startsAt: nowMs - 3 * 60 * 60_000,
        endsAt: nowMs + 9 * 60 * 60_000,
        curfewAt: Math.ceil((nowMs + options.curfewInMinutes! * 60_000) / 300_000) * 300_000,
      }
    : defaultRollCallWindow(nowMs);
  const tonight = await insertRollCall(db, window, "system");
  scans.push(
    ...buildNight(tonight.id, students, random, {
      // Arrivals spread over the evening up to curfew (or up to now, if curfew hasn't passed yet).
      fromMs: Math.max(window.startsAt, Math.min(nowMs, window.curfewAt) - 3.5 * 60 * 60_000),
      toMs: nowMs - 60_000,
      curfewMs: window.curfewAt,
      // Before curfew the roll call is still filling up; after it, most students are back.
      attendance: nowMs > window.curfewAt ? 0.9 : live ? 0.86 : 0.68,
      flags: true,
      prefix: "seed-tonight",
      tonight: true,
    }),
  );
  await insertScans(db, scans);

  await db.query(`insert into audit_log (actor, action, detail) values ('system', 'seed', 'Demo data loaded')`);
}

export async function resetDemoData(db: Db, options: SeedOptions = {}): Promise<void> {
  await db.exec(`truncate scans, roll_calls, students, staff, checkpoints, emergencies, audit_log restart identity cascade`);
  await seedDemoData(db, Date.now(), options);
}
