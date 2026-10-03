import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db";
import { headcount, headcountCsv } from "@/lib/emergency";
import { adminOverview, filtersFromSearchParams, searchRecords } from "@/lib/queries";
import { formatClock, formatDate } from "@/lib/time";
import { RESULT_META } from "@/lib/verify";

/** CSV downloads: `kind=records` (filtered scan log), `kind=missing` (who hasn't checked in) or `kind=headcount`. */
export async function GET(request: NextRequest) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const params = request.nextUrl.searchParams;
  const db = await getDb();
  const stamp = new Date().toISOString().slice(0, 10);
  let csv: string;
  let filename: string;

  if (params.get("kind") === "headcount") {
    const id = Number(params.get("emergencyId"));
    const count = await headcount(db, Number.isInteger(id) && id > 0 ? id : undefined);
    if (!count) return NextResponse.json({ error: "No headcount found" }, { status: 404 });
    csv = headcountCsv(count);
    filename = `nightpass-headcount-${stamp}.csv`;
  } else if (params.get("kind") === "missing") {
    const id = Number(params.get("rollCallId"));
    const overview = await adminOverview(db, Number.isInteger(id) && id > 0 ? id : undefined);
    if (!overview) return NextResponse.json({ error: "Roll call not found" }, { status: 404 });
    csv = toCsv(
      ["Student ID", "Name", "Hostel", "Room", "Email", "Last attempt", "Attempt time", "Attempt detail"],
      overview.missing.map((m) => [
        m.id, m.name, m.hostel, m.room, m.email,
        m.lastAttempt ? RESULT_META[m.lastAttempt.result].label : "",
        m.lastAttempt ? formatClock(m.lastAttempt.at) : "",
        m.lastAttempt?.reason ?? "",
      ]),
    );
    filename = `nightpass-missing-${stamp}.csv`;
  } else {
    const records = await searchRecords(db, { ...filtersFromSearchParams(params), limit: 10_000 });
    csv = toCsv(
      ["Date", "Time", "Roll call", "Student ID", "Name", "Hostel", "Room", "Where", "Method", "Result", "Detail",
        "Scanned by", "Recorded offline", "Resolved by", "Resolution note"],
      records.map((r) => [
        formatDate(r.scannedAt), formatClock(r.scannedAt, true), r.rollCall, r.studentId ?? r.claimedId ?? "",
        r.studentName ?? "", r.hostel ?? "", r.room ?? "", r.checkpoint ?? "", r.method, RESULT_META[r.result].label,
        r.reason, r.scannedBy ?? "", r.offline ? "yes" : "no", r.resolvedBy ?? "", r.resolutionNote ?? "",
      ]),
    );
    filename = `nightpass-records-${stamp}.csv`;
  }

  // BOM so Excel opens UTF-8 names (e.g. Arabic) correctly.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
