import { NextResponse } from "next/server";
import { listRoomTags } from "@/lib/admin";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Signed tags for every room, ready to print as stickers. */
export async function GET() {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ tags: await listRoomTags(await getDb()) }, { headers: { "Cache-Control": "no-store" } });
}
