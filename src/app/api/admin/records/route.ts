import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { filtersFromSearchParams, searchRecords } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const records = await searchRecords(await getDb(), filtersFromSearchParams(request.nextUrl.searchParams));
  return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
}
