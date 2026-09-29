import { describe, expect, it } from "vitest";
import { PERIOD_SECONDS, parsePass, periodAt, publicKeyFor, signPass } from "../src/lib/pass";
import { verifyManual, verifyPass, type Presence, type RosterEntry, type VerifyContext } from "../src/lib/verify";

const secretKey = new Uint8Array(32).fill(7);
const publicKey = publicKeyFor(secretKey);
const otherSecret = new Uint8Array(32).fill(9);

const NOW = Date.UTC(2026, 8, 29, 18, 0, 0); // 22:00 campus time
const roster: Record<string, RosterEntry> = {
  "2024A7PS0112U": { id: "2024A7PS0112U", name: "Aarav Mehta", hostel: "A-Block", room: "A-214" },
  "2023A3PS0048U": { id: "2023A3PS0048U", name: "Fatima Al Mansoori", hostel: "B-Block", room: "B-108" },
};

function context(overrides: Partial<VerifyContext> = {}, present: Record<string, Presence> = {}): VerifyContext {
  return {
    nowMs: NOW,
    publicKey,
    curfewAtMs: NOW + 30 * 60_000,
    findStudent: (id) => roster[id],
    findPresence: (id) => present[id],
    ...overrides,
  };
}

const livePass = (id: string, atMs = NOW) => signPass(id, periodAt(atMs), secretKey);

describe("pass codes", () => {
  it("round-trips through parsePass", () => {
    const parsed = parsePass(livePass("2024A7PS0112U"));
    expect(parsed?.studentId).toBe("2024A7PS0112U");
    expect(parsed?.period).toBe(periodAt(NOW));
  });

  it("rejects malformed input", () => {
    for (const raw of ["", "hello", "NP1.x.y", "NP2.2024A7PS0112U.abc.def", "NP1.bad id.1.AAAA"]) {
      expect(parsePass(raw)).toBeNull();
    }
  });

  it("keeps QR payload small enough to scan quickly", () => {
    expect(livePass("2024A7PS0112U").length).toBeLessThan(120);
  });
});

describe("verifyPass", () => {
  it("accepts a live code before curfew", () => {
    const verdict = verifyPass(livePass("2024A7PS0112U"), context());
    expect(verdict.result).toBe("valid");
    expect(verdict.student?.name).toBe("Aarav Mehta");
  });

  it("accepts a code from the previous period (scan jitter)", () => {
    const verdict = verifyPass(livePass("2024A7PS0112U", NOW - PERIOD_SECONDS * 1000), context());
    expect(verdict.result).toBe("valid");
  });

  it("rejects a screenshot that is a minute old", () => {
    const verdict = verifyPass(livePass("2024A7PS0112U", NOW - 60_000), context());
    expect(verdict.result).toBe("expired");
    expect(verdict.reason).toMatch(/screenshot/);
  });

  it("rejects a code signed with a different key (forgery)", () => {
    const forged = signPass("2024A7PS0112U", periodAt(NOW), otherSecret);
    expect(verifyPass(forged, context()).result).toBe("invalid");
  });

  it("rejects a code whose student ID was edited", () => {
    const tampered = livePass("2024A7PS0112U").replace("2024A7PS0112U", "2023A3PS0048U");
    const verdict = verifyPass(tampered, context());
    expect(verdict.result).toBe("invalid");
    expect(verdict.reason).toMatch(/forged|altered/);
  });

  it("rejects a code far in the future", () => {
    const verdict = verifyPass(livePass("2024A7PS0112U", NOW + 5 * 60_000), context());
    expect(verdict.result).toBe("invalid");
  });

  it("flags a genuine code for a student not on the active roster", () => {
    const verdict = verifyPass(livePass("2019B1PS0001U"), context());
    expect(verdict.result).toBe("unknown");
    expect(verdict.claimedId).toBe("2019B1PS0001U");
  });

  it("flags a second scan for a student already present", () => {
    const present = { "2024A7PS0112U": { atMs: NOW - 10 * 60_000, checkpoint: "A-Block Gate" } };
    const verdict = verifyPass(livePass("2024A7PS0112U"), context({}, present));
    expect(verdict.result).toBe("duplicate");
    expect(verdict.reason).toContain("A-Block Gate");
  });

  it("marks arrivals after curfew as late", () => {
    const verdict = verifyPass(livePass("2024A7PS0112U"), context({ curfewAtMs: NOW - 12 * 60_000 }));
    expect(verdict.result).toBe("late");
    expect(verdict.reason).toBe("12 min after curfew");
  });
});

describe("verifyManual", () => {
  it("records a manual check-in with the guard's reason", () => {
    const verdict = verifyManual("2023A3PS0048U", "Phone battery dead", context());
    expect(verdict.result).toBe("manual");
    expect(verdict.reason).toContain("Phone battery dead");
  });

  it("still catches duplicates on manual entry", () => {
    const present = { "2023A3PS0048U": { atMs: NOW, checkpoint: "Main Gate" } };
    expect(verifyManual("2023A3PS0048U", "No phone", context({}, present)).result).toBe("duplicate");
  });

  it("rejects manual entry for unknown IDs", () => {
    expect(verifyManual("NOPE1234", "", context()).result).toBe("unknown");
  });
});
