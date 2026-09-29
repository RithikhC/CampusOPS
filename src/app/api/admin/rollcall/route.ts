import { NextResponse } from "next/server";
import { setCurfew, startNewRollCall } from "@/lib/admin";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => ({}))) as { action?: string; rollCallId?: number; time?: string };
  const db = await getDb();

  if (body.action === "new") {
    return NextResponse.json({ rollCall: await startNewRollCall(db, user) });
  }
  if (body.action === "curfew" && typeof body.rollCallId === "number" && typeof body.time === "string") {
    const rollCall = await setCurfew(db, user, body.rollCallId, body.time);
    if (!rollCall) return NextResponse.json({ error: "Invalid time" }, { status: 400 });
    return NextResponse.json({ rollCall });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
