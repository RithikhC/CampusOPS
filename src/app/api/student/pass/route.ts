import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { studentPass } from "@/lib/queries";

export async function GET() {
  const user = await authorize(["student"]);
  if (user instanceof NextResponse) return user;

  const pass = await studentPass(await getDb(), user.id);
  if (!pass) return NextResponse.json({ error: "Your pass is not active. Contact the hostel office." }, { status: 404 });
  return NextResponse.json(pass, { headers: { "Cache-Control": "no-store" } });
}
