import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { isOnCampus } from "@/lib/network";
import { roomCheckIn } from "@/lib/roomcheck";
import { parsePasskeyProof, siteFromHeaders } from "@/lib/webauthn";

/**
 * A student checks in from their room.
 * Body: { tag, deviceId, challenge, passkey?, passkeyFailed? }
 */
export async function POST(request: Request) {
  const user = await authorize(["student"]);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => ({}))) as {
    tag?: string;
    deviceId?: string;
    challenge?: string;
    passkey?: unknown;
    passkeyFailed?: boolean;
    simulateOffCampus?: boolean;
  };
  if (typeof body.tag !== "string" || typeof body.deviceId !== "string" || body.deviceId.length < 8) {
    return NextResponse.json({ error: "Scan the tag inside your room" }, { status: 400 });
  }

  // The network is judged from the request itself. The demo can pretend to be off campus.
  const onCampus = isOnCampus(request.headers) && !(config.demoMode && body.simulateOffCampus);
  const outcome = await roomCheckIn(await getDb(), user.id, {
    tag: body.tag.slice(0, 512),
    deviceId: body.deviceId,
    onCampus,
    challenge: typeof body.challenge === "string" ? body.challenge.slice(0, 300) : undefined,
    passkey: parsePasskeyProof(body.passkey),
    passkeyFailed: body.passkeyFailed === true,
    site: siteFromHeaders(request.headers, request.url),
  });
  return NextResponse.json(outcome);
}
