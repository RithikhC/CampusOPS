import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { emergencyAction, headcount } from "@/lib/emergency";

/** The headcount in progress, or { emergency: null }. */
export async function GET() {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;
  return NextResponse.json((await headcount(await getDb())) ?? { emergency: null }, { headers: { "Cache-Control": "no-store" } });
}

/** Start or end a headcount, mark someone, or scan a pass at the assembly point (see emergencyAction). */
export async function POST(request: Request) {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await emergencyAction(await getDb(), user, body);
  return NextResponse.json(result.body, { status: result.status });
}
