import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseIncomingScans, recordScans } from "@/lib/scans";

/** Scanners post batches here (one scan when online, the whole queue after being offline). */
export async function POST(request: Request) {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;

  const scans = parseIncomingScans(await request.json().catch(() => null));
  if (!scans) return NextResponse.json({ error: "Malformed scan batch" }, { status: 400 });

  const results = await recordScans(await getDb(), user, scans);
  return NextResponse.json({ results });
}
