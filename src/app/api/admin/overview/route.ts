import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { adminOverview } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const id = Number(request.nextUrl.searchParams.get("rollCallId"));
  const overview = await adminOverview(await getDb(), Number.isInteger(id) && id > 0 ? id : undefined);
  if (!overview) return NextResponse.json({ error: "Roll call not found" }, { status: 404 });
  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
