import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildRounds, recordVisit } from "@/lib/rounds";

/** Tonight's list of rooms to visit. */
export async function GET() {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await buildRounds(await getDb()), { headers: { "Cache-Control": "no-store" } });
}

/** What the warden found at a door: body { studentId, outcome: "present" | "absent" }. */
export async function POST(request: Request) {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;

  const { studentId, outcome } = (await request.json().catch(() => ({}))) as { studentId?: string; outcome?: string };
  if (typeof studentId !== "string" || (outcome !== "present" && outcome !== "absent")) {
    return NextResponse.json({ error: "Choose a student and an outcome" }, { status: 400 });
  }
  const db = await getDb();
  const ok = await recordVisit(db, user, studentId, outcome);
  if (!ok) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  return NextResponse.json(await buildRounds(db));
}
