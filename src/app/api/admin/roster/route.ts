import { NextResponse } from "next/server";
import { importRoster } from "@/lib/admin";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const students = await (await getDb()).query(
    `select id, name, email, hostel, room, active from students order by hostel, name`,
  );
  return NextResponse.json({ students }, { headers: { "Cache-Control": "no-store" } });
}

/** Body: { csv }, a roster export from the university student system. */
export async function POST(request: Request) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const { csv } = (await request.json().catch(() => ({}))) as { csv?: string };
  if (typeof csv !== "string" || csv.length > 2_000_000) {
    return NextResponse.json({ error: "Upload a CSV file under 2 MB" }, { status: 400 });
  }
  return NextResponse.json(await importRoster(await getDb(), user, csv));
}
