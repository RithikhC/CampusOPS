import { PGlite } from "@electric-sql/pglite";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/lib/config";
import type { Db } from "../src/lib/dbcore";
import { demoPasskey, type DemoPasskey } from "../src/lib/demopasskey";
import { fromHex, toBase64Url } from "../src/lib/pass";
import { roomCheckIn } from "../src/lib/roomcheck";
import { signRoomTag } from "../src/lib/roomtag";
import { buildRounds } from "../src/lib/rounds";
import { SCHEMA_SQL } from "../src/lib/schema";
import { seedDemoData } from "../src/lib/seed";
import { checkChallenge, issueChallenge, spkiFromPoint, verifyPasskey, type PasskeyProof } from "../src/lib/webauthn";

// 21:55 campus time; tonight's curfew is 22:30.
const NOW = Date.UTC(2026, 8, 29, 17, 55);
const SITE = { origin: "https://nightpass.test", rpId: "nightpass.test" };
const publicKey = fromHex(config.qrPublicKeyHex);
const encoder = new TextEncoder();
const AARAV = { id: "2024A7PS0112U", hostel: "A-Block", room: "A-214" };
const FATIMA = { id: "2023A3PS0048U", hostel: "B-Block", room: "B-108" };
const ROHAN = { id: "2022B4PS0217U", hostel: "C-Block", room: "C-305" };

/** What a phone's passkey would send back, built the same way a real authenticator does. */
function phoneResponse(
  kind: "create" | "get",
  key: DemoPasskey,
  challenge: string,
  options: { origin?: string; rpId?: string; verified?: boolean } = {},
): PasskeyProof {
  const clientDataJSON = encoder.encode(
    JSON.stringify({ type: `webauthn.${kind}`, challenge: toBase64Url(encoder.encode(challenge)), origin: options.origin ?? SITE.origin }),
  );
  const authData = new Uint8Array(37);
  authData.set(sha256(encoder.encode(options.rpId ?? SITE.rpId)));
  authData[32] = options.verified === false ? 0x01 : 0x05;
  authData[36] = 1;
  const base = { kind, credentialId: key.credentialId, clientDataJSON: toBase64Url(clientDataJSON), authenticatorData: toBase64Url(authData) };
  if (kind === "create") return { ...base, publicKey: toBase64Url(spkiFromPoint(p256.getPublicKey(key.secretKey, false))) };
  const signed = new Uint8Array([...authData, ...sha256(clientDataJSON)]);
  return { ...base, signature: toBase64Url(p256.sign(signed, key.secretKey, { format: "der" })) };
}

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

describe("passkey checks", () => {
  const key = demoPasskey(AARAV.id, "test-phone");
  const challenge = issueChallenge(AARAV.id, NOW, config.qrSigningKey);

  it("accepts a new passkey, then a signature made with it", () => {
    const created = verifyPasskey(phoneResponse("create", key, challenge), { challenge, ...SITE });
    expect(created.ok).toBe(true);
    const later = issueChallenge(AARAV.id, NOW, config.qrSigningKey);
    const signed = verifyPasskey(phoneResponse("get", key, later), { challenge: later, ...SITE, publicKey: created.ok ? created.publicKey : null });
    expect(signed).toEqual({ ok: true, publicKey: key.publicKey });
  });

  it("refuses a signature from a different phone's key", () => {
    const other = demoPasskey(AARAV.id, "another-phone");
    const result = verifyPasskey(phoneResponse("get", other, challenge), { challenge, ...SITE, publicKey: key.publicKey });
    expect(result).toMatchObject({ ok: false, reason: "signature doesn't match" });
  });

  it("refuses a response made for another website, or without the fingerprint check", () => {
    expect(verifyPasskey(phoneResponse("get", key, challenge, { origin: "https://evil.test" }), { challenge, ...SITE, publicKey: key.publicKey }).ok).toBe(false);
    expect(verifyPasskey(phoneResponse("get", key, challenge, { rpId: "evil.test" }), { challenge, ...SITE, publicKey: key.publicKey }).ok).toBe(false);
    expect(verifyPasskey(phoneResponse("get", key, challenge, { verified: false }), { challenge, ...SITE, publicKey: key.publicKey })).toMatchObject({
      ok: false,
      reason: "fingerprint or face was not checked",
    });
  });

  it("only accepts a challenge for the same student, before it expires", () => {
    expect(checkChallenge(challenge, AARAV.id, NOW + 60_000, publicKey)).toBe(true);
    expect(checkChallenge(challenge, FATIMA.id, NOW + 60_000, publicKey)).toBe(false);
    expect(checkChallenge(challenge, AARAV.id, NOW + 11 * 60_000, publicKey)).toBe(false);
    const flipped = challenge.slice(0, -20) + (challenge.at(-20) === "A" ? "B" : "A") + challenge.slice(-19);
    expect(checkChallenge(flipped, AARAV.id, NOW, publicKey)).toBe(false);
  });
});

describe("room check-in with a fingerprint", () => {
  let db: Db;
  const fatimaKey = demoPasskey(FATIMA.id, "fatima-phone");
  const rohanKey = demoPasskey(ROHAN.id, "rohan-phone");

  beforeAll(async () => {
    db = await freshDb();
    // Fatima and Rohan set up their phones on an earlier night.
    for (const [student, phone, key] of [[FATIMA, "fatima-phone", fatimaKey], [ROHAN, "rohan-phone", rohanKey]] as const) {
      await db.query(`insert into student_devices (student_id, device_id, registered_at, credential_id, public_key) values ($1, $2, $3, $4, $5)`, [
        student.id,
        phone,
        new Date(NOW - 20 * 24 * 60 * 60_000),
        key.credentialId,
        key.publicKey,
      ]);
    }
  }, 60_000);

  const attempt = (student: typeof AARAV, deviceId: string, extra: object) => {
    const challenge = issueChallenge(student.id, NOW, config.qrSigningKey);
    return {
      challenge,
      input: { tag: signRoomTag(student.hostel, student.room, config.qrSigningKey), deviceId, onCampus: true, challenge, site: SITE, ...extra },
    };
  };

  it("sets up the fingerprint check on the first check-in", async () => {
    const key = demoPasskey(AARAV.id, "aarav-phone");
    const { challenge, input } = attempt(AARAV, "aarav-phone", {});
    const outcome = await roomCheckIn(db, AARAV.id, { ...input, passkey: phoneResponse("create", key, challenge) }, NOW);
    expect(outcome).toMatchObject({ ok: true, result: "valid" });
    const [device] = await db.query<{ credential_id: string; public_key: string }>(`select credential_id, public_key from student_devices where student_id = $1`, [AARAV.id]);
    expect(device).toEqual({ credential_id: key.credentialId, public_key: key.publicKey });
  });

  it("checks in with the registered phone's fingerprint", async () => {
    const { challenge, input } = attempt(FATIMA, "fatima-phone", {});
    const outcome = await roomCheckIn(db, FATIMA.id, { ...input, passkey: phoneResponse("get", fatimaKey, challenge) }, NOW);
    expect(outcome).toMatchObject({ ok: true, result: "valid" });
    const [scan] = await db.query<{ user_verified: boolean; reason: string }>(
      `select user_verified, reason from scans where student_id = $1 and result = 'valid'`,
      [FATIMA.id],
    );
    expect(scan).toEqual({ user_verified: true, reason: "Checked in from room B-108" });
  });

  it("refuses when someone else's finger fails the phone's check, and records it", async () => {
    const outcome = await roomCheckIn(db, ROHAN.id, { ...attempt(ROHAN, "rohan-phone", {}).input, passkeyFailed: true }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
    const [scan] = await db.query<{ reason: string }>(`select reason from scans where student_id = $1 and result = 'invalid' order by id desc limit 1`, [ROHAN.id]);
    expect(scan.reason).toBe("Fingerprint or face check failed on the student's phone");
  });

  it("refuses a phone set up for fingerprints that skips the check", async () => {
    const outcome = await roomCheckIn(db, ROHAN.id, attempt(ROHAN, "rohan-phone", {}).input, NOW);
    expect(outcome).toMatchObject({ ok: false, message: "Confirm with your fingerprint or face to check in." });
  });

  it("refuses a signature from a key that isn't Rohan's", async () => {
    const { challenge, input } = attempt(ROHAN, "rohan-phone", {});
    const impostor = { ...demoPasskey(ROHAN.id, "copied-phone"), credentialId: rohanKey.credentialId };
    const outcome = await roomCheckIn(db, ROHAN.id, { ...input, passkey: phoneResponse("get", impostor, challenge) }, NOW);
    expect(outcome).toMatchObject({ ok: false, result: "invalid" });
  });

  it("refuses a challenge that was issued to another student", async () => {
    const { input } = attempt(ROHAN, "rohan-phone", {});
    const stolen = issueChallenge(FATIMA.id, NOW, config.qrSigningKey);
    const outcome = await roomCheckIn(db, ROHAN.id, { ...input, challenge: stolen, passkey: phoneResponse("get", rohanKey, stolen) }, NOW);
    expect(outcome).toMatchObject({ ok: false, message: "That took too long. Try again." });
  });

  it("spot-checks room check-ins made without a fingerprint", async () => {
    const rounds = await buildRounds(db, undefined, NOW + 50 * 60_000);
    const reasons = rounds!.items.flatMap((item) => item.reasons);
    expect(reasons).toContain("Checked in without a fingerprint check");
    const rohan = rounds!.items.find((item) => item.student.id === ROHAN.id);
    expect(rohan).toMatchObject({ kind: "missing", reasons: ["No check-in, and a rejected attempt tonight"] });
  });
});
