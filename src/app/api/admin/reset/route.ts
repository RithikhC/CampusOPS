import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { resetDemoData } from "@/lib/seed";

/** Demo only: wipe and reload sample data so tonight's roll call starts "now". */
export async function POST() {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;
  if (!config.demoMode) return NextResponse.json({ error: "Demo mode is off" }, { status: 403 });

  await resetDemoData(await getDb());
  return NextResponse.json({ ok: true });
}
