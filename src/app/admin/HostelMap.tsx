"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import type { Headcount } from "@/lib/emergency";
import type { MapRoom, RoomState } from "@/lib/queries";

/**
 * Every room in every block, drawn floor by floor like the front of the building. Each room is
 * split between the students in it, coloured by how they stand tonight, or during an emergency
 * headcount, by whether they are safe.
 */
type Shade = { label: string; color: string; pulse?: boolean };

const NIGHT: Record<RoomState, Shade> = {
  in: { label: "Checked in", color: "#16a34a" },
  check: { label: "Spot check to do", color: "#f59e0b" },
  missing: { label: "No check-in", color: "#dc2626" },
  absent: { label: "Not in room when visited", color: "#7f1d1d" },
};

const EMERGENCY = {
  safe: { label: "Safe", color: "#16a34a" },
  help: { label: "Needs help", color: "#dc2626", pulse: true },
  inside: { label: "Not accounted for, checked in tonight", color: "#f59e0b" },
  out: { label: "Not accounted for, not checked in", color: "#94a3b8" },
} satisfies Record<string, Shade>;

type EmergencyShade = keyof typeof EMERGENCY;

const naturalOrder = new Intl.Collator("en", { numeric: true });

/** "A-214" → floor 2, room 14. Rooms that don't follow the pattern go on a row of their own. */
function place(room: string): { floor: string; number: number } {
  const match = /(\d)(\d{2})$/.exec(room);
  return match ? { floor: match[1], number: Number(match[2]) } : { floor: "other", number: 0 };
}

export function HostelMap({ rooms, headcount, title = "Hostel map" }: { rooms: MapRoom[]; headcount?: Headcount | null; title?: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  const emergencyShade = useMemo(() => {
    if (!headcount) return null;
    return new Map(
      headcount.people.map((p): [string, EmergencyShade] => [
        p.student.id,
        p.status === "safe" ? "safe" : p.status === "help" ? "help" : p.likelyInside ? "inside" : "out",
      ]),
    );
  }, [headcount]);

  const shadeOf = (student: MapRoom["students"][number]): Shade =>
    emergencyShade ? EMERGENCY[emergencyShade.get(student.id) ?? "out"] : NIGHT[student.state];

  const blocks = useMemo(() => {
    const byBlock = new Map<string, Map<string, Map<number, MapRoom>>>();
    for (const room of rooms) {
      const { floor, number } = place(room.room);
      if (!byBlock.has(room.hostel)) byBlock.set(room.hostel, new Map());
      const floors = byBlock.get(room.hostel)!;
      if (!floors.has(floor)) floors.set(floor, new Map());
      floors.get(floor)!.set(number, room);
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => naturalOrder.compare(a, b))
      .map(([hostel, floors]) => {
        const width = Math.max(...[...floors.values()].flatMap((f) => [...f.keys()]), 1);
        // Top floor first, like looking at the building.
        const rows = [...floors.entries()].sort(([a], [b]) => naturalOrder.compare(b, a));
        return { hostel, width, rows };
      });
  }, [rooms]);

  const legend = emergencyShade ? Object.values(EMERGENCY) : Object.values(NIGHT);
  const counts = new Map<string, number>();
  for (const room of rooms) for (const s of room.students) counts.set(shadeOf(s).label, (counts.get(shadeOf(s).label) ?? 0) + 1);
  const chosen = rooms.find((r) => `${r.hostel}|${r.room}` === selected);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((shade) => (
            <li key={shade.label} className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm" style={{ background: shade.color }} aria-hidden />
              {shade.label} <span className="tabular-nums text-text">{counts.get(shade.label) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {blocks.map((block) => (
          <section key={block.hostel} aria-label={block.hostel}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{block.hostel}</h3>
            <div className="flex flex-col gap-1">
              {block.rows.map(([floor, cells]) => (
                <div
                  key={floor}
                  className="grid items-center gap-1"
                  style={{ gridTemplateColumns: `3.5rem repeat(${block.width}, minmax(0, 1.75rem))` }}
                >
                  <span className="text-xs text-muted">{floor === "other" ? "Other" : `Floor ${floor}`}</span>
                  {Array.from({ length: block.width }, (_, i) => {
                    const room = cells.get(i + 1) ?? (floor === "other" ? [...cells.values()][i] : undefined);
                    if (!room) return <span key={i} className="aspect-square rounded-[4px] border border-dashed border-line" aria-hidden />;
                    const key = `${room.hostel}|${room.room}`;
                    const shades = room.students.map(shadeOf);
                    const label = `${room.room}: ${room.students.map((s, j) => `${s.name}, ${shades[j].label.toLowerCase()}`).join("; ")}`;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelected(selected === key ? null : key)}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected === key}
                        className={`flex aspect-square overflow-hidden rounded-[4px] ring-offset-1 ${selected === key ? "ring-2 ring-text" : ""}`}
                      >
                        {shades.map((shade, j) => (
                          <span key={j} className={`h-full flex-1 ${shade.pulse ? "animate-pulse" : ""}`} style={{ background: shade.color }} />
                        ))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-3 min-h-5 text-sm">
        {chosen ? (
          <>
            <strong>
              {chosen.hostel} · Room {chosen.room}:
            </strong>{" "}
            {chosen.students.map((s) => `${s.name} (${shadeOf(s).label.toLowerCase()})`).join(", ")}
          </>
        ) : (
          <span className="text-muted">Each square is a room, split between the students in it. Tap a room to see who lives there.</span>
        )}
      </p>
    </Card>
  );
}
