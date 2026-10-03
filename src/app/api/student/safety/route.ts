import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activeEmergency, markSafety } from "@/lib/emergency";

/** During a headcount, a student says they are safe or need help: body { status: "safe" | "help" }. */
export async function POST(request: Request) {
  const user = await authorize(["student"]);
  if (user instanceof NextResponse) return user;

  const { status } = (await request.json().catch(() => ({}))) as { status?: string };
  if (status !== "safe" && status !== "help") return NextResponse.json({ error: "Choose safe or help" }, { status: 400 });
  const db = await getDb();
  const emergency = await activeEmergency(db);
  if (!emergency) return NextResponse.json({ error: "There is no headcount running" }, { status: 409 });
  await markSafety(db, emergency.id, user.id, status, "self", user.id);
  return NextResponse.json({ ok: true });
}
