import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guardBootstrap } from "@/lib/queries";

/** Everything a scanner needs to keep working offline: roster, who is already in, and the public key. */
export async function GET() {
  const user = await authorize(["guard", "admin"]);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await guardBootstrap(await getDb()), { headers: { "Cache-Control": "no-store" } });
}
