"use client";

import { Clock, DoorOpen, ExternalLink, Loader2, RotateCcw, ScanLine, Siren, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/ui";
import { parseCsv } from "@/lib/csv";
import { DEMO_STUDENTS } from "./client";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const REPO_URL = "https://github.com/RithikhC/CampusOPS";

const PHONE = { w: 390, h: 844, scale: 0.86 };
const LAPTOP = { w: 1280, h: 870, scale: 0.78 };
const GAP = 48;
const PAD = 40;
// Frame widths include the device bezels (phone: 10px each side, laptop: 8px each side).
const PHONE_FRAME_W = PHONE.w * PHONE.scale + 20;
const LAPTOP_FRAME_W = LAPTOP.w * LAPTOP.scale + 16;
const DESIGN_W = PAD * 2 + PHONE_FRAME_W * 2 + LAPTOP_FRAME_W + GAP * 2;

type Device = "student" | "guard" | "admin";

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

export default function DemoConsole() {
  const [present] = useState(() => new URLSearchParams(window.location.search).has("present"));
  const [backend] = useState(() => {
    window.__nightpassBackend ??= import("./backend").then((m) => m.createBackend());
    return window.__nightpassBackend;
  });
  const [ready, setReady] = useState(false);
  const [studentId, setStudentId] = useState(DEMO_STUDENTS[0].id);
  const [offline, setOfflineState] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Device | null>(null);
  const [csv, setCsv] = useState<string[][] | null>(null);
  const [taps, setTaps] = useState<{ id: number; x: number; y: number }[]>([]);
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);

  const stageRef = useRef<HTMLDivElement>(null);
  const studentFrame = useRef<HTMLIFrameElement>(null);
  const guardFrame = useRef<HTMLIFrameElement>(null);
  const adminFrame = useRef<HTMLIFrameElement>(null);
  const frameFor = useCallback(
    (device: Device) => ({ student: studentFrame, guard: guardFrame, admin: adminFrame })[device].current,
    [],
  );

  useEffect(() => {
    void backend.then(() => setReady(true));
  }, [backend]);

  const frameWindow = useCallback(
    (device: Device) => (frameFor(device)?.contentWindow ?? null) as (Window & typeof globalThis) | null,
    [frameFor],
  );

  const find = useCallback(
    (device: Device, target: string): HTMLElement | null => {
      const doc = frameWindow(device)?.document;
      if (!doc) return null;
      if (/^[.#[]/.test(target)) return doc.querySelector<HTMLElement>(target);
      const candidates = [...doc.querySelectorAll<HTMLElement>("button, a, label, [role=tab], li button")];
      return (
        candidates.find((el) => el.textContent?.trim() === target) ??
        candidates.find((el) => el.textContent?.trim().startsWith(target)) ??
        candidates.find((el) => el.textContent?.includes(target)) ??
        null
      );
    },
    [frameWindow],
  );

  /** Shows a tap ripple over the element, then clicks it. */
  const tap = useCallback(
    async (device: Device, target: string) => {
      const el = find(device, target);
      const frame = frameFor(device);
      const stage = stageRef.current;
      if (!el || !frame || !stage) return false;
      el.scrollIntoView({ block: "nearest" });
      const frameRect = frame.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const frameScale = frameRect.width / frame.offsetWidth;
      const stageScale = stageRect.width / stage.offsetWidth;
      const r = el.getBoundingClientRect();
      const x = (frameRect.left + (r.left + r.width / 2) * frameScale - stageRect.left) / stageScale;
      const y = (frameRect.top + (r.top + r.height / 2) * frameScale - stageRect.top) / stageScale;
      const id = Date.now() + Math.random();
      setTaps((list) => [...list, { id, x, y }]);
      window.setTimeout(() => setTaps((list) => list.filter((t) => t.id !== id)), 900);
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      el.click();
      return true;
    },
    [find, frameFor],
  );

  const typeText = useCallback(
    async (device: Device, selector: string, text: string) => {
      const win = frameWindow(device);
      const input = win?.document.querySelector<HTMLInputElement>(selector);
      if (!win || !input) return false;
      input.focus();
      const setValue = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
      for (let i = 1; i <= text.length; i++) {
        setValue.call(input, text.slice(0, i));
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 70));
      }
      return true;
    },
    [frameWindow],
  );

  const setOffline = useCallback(
    (value: boolean) => {
      const win = frameWindow("guard");
      if (!win) return;
      win.__nightpassOffline = value;
      win.dispatchEvent(new win.Event(value ? "offline" : "online"));
      setOfflineState(value);
    },
    [frameWindow],
  );

  /** Holds the current student's pass (or an old screenshot of it) up to the guard's camera. */
  const showPass = useCallback(
    async (periodsAgo = 0, who = studentId) => {
      const guard = frameWindow("guard");
      if (!guard) return;
      for (const start of ["Start scanning", "Scan passes at the assembly point"]) {
        if (find("guard", start)) {
          await tap("guard", start);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          break;
        }
      }
      const code = (await backend).passCode(who, periodsAgo);
      guard.__nightpassCamera?.show(code);
    },
    [backend, find, frameWindow, studentId, tap],
  );

  /**
   * The student checks in from their room: opens the check-in screen, points the phone at the tag
   * on the door, and confirms with a fingerprint. Options simulate doing it from outside the
   * hostel, on someone else's phone, with someone else's finger, or from the room next door.
   */
  const roomCheckIn = useCallback(
    async (options: { offCampus?: boolean; otherPhone?: boolean; wrongFinger?: boolean; nextDoor?: boolean } = {}, who = studentId) => {
      const student = frameWindow("student");
      if (!student) return false;
      student.__nightpassOffCampus = Boolean(options.offCampus);
      student.__nightpassDeviceOverride = options.otherPhone ? "a-friends-phone" : undefined;
      student.__nightpassFingerprint = options.wrongFinger ? "fail" : undefined;
      if (find("student", "Try again")) await tap("student", "Try again");
      else if (!(await tap("student", "Check in from my room"))) return false;
      await new Promise((resolve) => window.setTimeout(resolve, 1300));
      const api = await backend;
      const info = DEMO_STUDENTS.find((s) => s.id === who)!;
      const tag = options.nextDoor ? api.roomTagFor(info.hostel, info.nextDoor) : await api.roomTag(who);
      student.__nightpassCamera?.show(tag, 2400, "tag");
      return true;
    },
    [backend, find, frameWindow, studentId, tap],
  );

  /** Tells a screen its connection is back, so it refreshes now instead of at its next poll. */
  const nudge = useCallback(
    (device: Device) => {
      const win = frameWindow(device);
      if (win && !(device === "guard" && win.__nightpassOffline)) win.dispatchEvent(new win.Event("online"));
    },
    [frameWindow],
  );

  /** The warden starts a fire-alarm headcount from the dashboard; the phones pick it up. */
  const startHeadcount = useCallback(async () => {
    if (!(await tap("admin", "Emergency headcount"))) return false;
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    await tap("admin", "Start headcount");
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    nudge("student");
    nudge("guard");
    return true;
  }, [nudge, tap]);

  /**
   * Students reaching the assembly point during a headcount: most tap "I'm safe" on their phones,
   * one asks for help. The demo students are left for the person trying the demo.
   */
  const evacuate = useCallback(async () => {
    const api = await backend;
    const warden = { id: "admin-1", name: "Warden", role: "admin" as const };
    const count = JSON.parse((await api.handle(warden, "GET", "/api/emergency", null)).body) as {
      emergency: unknown;
      people?: { student: { id: string; name: string }; status: string; likelyInside: boolean }[];
    };
    if (!count.emergency || !count.people) return;
    const waiting = count.people.filter((p) => p.status === "unaccounted" && !DEMO_STUDENTS.some((d) => d.id === p.student.id));
    // Nearly everyone who was inside gets out; fewer of the rest report in (many are away for the night).
    const leaving = waiting.filter((p, i) => (i * 37) % 100 < (p.likelyInside ? 91 : 55));
    for (let i = 0; i < leaving.length; i += 10) {
      await Promise.all(
        leaving.slice(i, i + 10).map((p, j) =>
          api.handle(
            { id: p.student.id, name: p.student.name, role: "student" },
            "POST",
            "/api/student/safety",
            JSON.stringify({ status: i === 40 && j === 3 ? "help" : "safe" }),
          ),
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }, [backend]);

  const endHeadcount = useCallback(async () => {
    const api = await backend;
    await api.handle({ id: "admin-1", name: "Warden", role: "admin" }, "POST", "/api/emergency", JSON.stringify({ action: "end" }));
    nudge("student");
    nudge("guard");
  }, [backend, nudge]);

  /** Clicks a button inside the card or row that mentions `rowText` (e.g. "In room" for one student). */
  const tapWithin = useCallback(
    async (device: Device, rowText: string, target: string) => {
      const doc = frameWindow(device)?.document;
      if (!doc) return false;
      let best: { el: HTMLElement; depth: number } | null = null;
      for (const el of doc.querySelectorAll<HTMLElement>("button")) {
        if (!el.textContent?.trim().startsWith(target)) continue;
        let node: HTMLElement | null = el.parentElement;
        for (let depth = 1; node && depth <= 6; depth++, node = node.parentElement) {
          if (node.textContent?.includes(rowText)) {
            if (!best || depth < best.depth) best = { el, depth };
            break;
          }
        }
      }
      if (!best) return false;
      best.el.setAttribute("data-demo-target", "1");
      const done = await tap(device, "[data-demo-target]");
      best.el.removeAttribute("data-demo-target");
      return done;
    },
    [frameWindow, tap],
  );

  /** Makes curfew "just passed", so the warden's rounds can start. */
  const curfewPasses = useCallback(async () => {
    const api = await backend;
    const warden = { id: "admin-1", name: "Warden", role: "admin" as const };
    const overview = JSON.parse((await api.handle(warden, "GET", "/api/admin/overview", null)).body);
    const time = new Date(Date.now() - 60_000).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });
    await api.handle(warden, "POST", "/api/admin/rollcall", JSON.stringify({ action: "curfew", rollCallId: overview.rollCall.id, time }));
    if (find("guard", "Room rounds")) await tap("guard", "Room rounds");
  }, [backend, find, tap]);

  const showCsv = useCallback(
    async (kind: "records" | "missing") => {
      const api = await backend;
      const warden = { id: "admin-1", name: "Warden", role: "admin" as const };
      const overview = JSON.parse((await api.handle(warden, "GET", "/api/admin/overview", null)).body);
      const result = await api.handle(warden, "GET", `/api/admin/export?kind=${kind}&rollCallId=${overview.rollCall.id}`, null);
      setCsv(parseCsv(result.body.replace(/^﻿/, "")).slice(0, 13));
    },
    [backend],
  );

  /** Moves tonight's curfew (campus time "HH:MM") and reloads the three screens. */
  const setCurfew = useCallback(
    async (time: string) => {
      const api = await backend;
      const warden = { id: "admin-1", name: "Warden", role: "admin" as const };
      const overview = JSON.parse((await api.handle(warden, "GET", "/api/admin/overview", null)).body);
      await api.handle(warden, "POST", "/api/admin/rollcall", JSON.stringify({ action: "curfew", rollCallId: overview.rollCall.id, time }));
      setReloadKey((k) => k + 1);
    },
    [backend],
  );

  const reset = useCallback(async () => {
    await (await backend).reset();
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("np_"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Storage blocked: nothing cached to clear.
    }
    setOffline(false);
    setReloadKey((k) => k + 1);
  }, [backend, setOffline]);

  // Controls for the recording script (and handy in the browser console).
  useEffect(() => {
    const director = {
      tap,
      type: typeText,
      showPass,
      roomCheckIn,
      tapWithin,
      curfewPasses,
      nudge,
      startHeadcount,
      evacuate,
      endHeadcount,
      showCsv,
      hideCsv: () => setCsv(null),
      setStudent: setStudentId,
      setOffline,
      caption: setCaption,
      chapter: setChapter,
      highlight: setHighlight,
      reset,
      setCurfew,
      scroll: (device: Device, y: number) => frameWindow(device)?.scrollTo({ top: y, behavior: "smooth" }),
      ready: () => backend.then(() => true),
    };
    (window as unknown as { __nightpassDirector: typeof director }).__nightpassDirector = director;
  }, [tap, typeText, showPass, roomCheckIn, tapWithin, curfewPasses, nudge, startHeadcount, evacuate, endHeadcount, showCsv, setOffline, reset, setCurfew, frameWindow, backend]);

  const scale = Math.min(present ? 2 : 1.1, (width - (present ? 0 : 32)) / DESIGN_W);
  const small = !present && width < 900;
  const firstName = (DEMO_STUDENTS.find((s) => s.id === studentId)?.name ?? "").split(" ")[0];

  const stage = (
    <div style={{ height: 800 * scale }} className="relative">
      <div
        ref={stageRef}
        className="absolute top-0 left-1/2 flex items-start"
        style={{ width: DESIGN_W, padding: `0 ${PAD}px`, gap: GAP, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
      >
        <DeviceFrame label="Student's phone" dim={highlight !== null && highlight !== "student"} lit={highlight === "student"}>
          <Phone>
            <iframe key={`s-${studentId}-${reloadKey}`} ref={studentFrame} title="Student pass" src={`${BASE_PATH}/student/?id=${studentId}`} style={phoneFrameStyle} />
          </Phone>
        </DeviceFrame>
        <DeviceFrame label="Guard / warden's phone" dim={highlight !== null && highlight !== "guard"} lit={highlight === "guard"}>
          <Phone>
            <iframe key={`g-${reloadKey}`} ref={guardFrame} title="Guard scanner" src={`${BASE_PATH}/guard/`} style={phoneFrameStyle} />
          </Phone>
        </DeviceFrame>
        <DeviceFrame label="Warden's dashboard" dim={highlight !== null && highlight !== "admin"} lit={highlight === "admin"}>
          <div className="overflow-hidden rounded-xl bg-[#1a1d24] p-2 shadow-2xl ring-1 ring-white/10">
            <div className="flex gap-1.5 px-2 pb-2" aria-hidden>
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </div>
            <div className="overflow-hidden rounded-md" style={{ width: LAPTOP.w * LAPTOP.scale, height: LAPTOP.h * LAPTOP.scale }}>
              <iframe
                key={`a-${reloadKey}`}
                ref={adminFrame}
                title="Warden dashboard"
                src={`${BASE_PATH}/admin/`}
                style={{ width: LAPTOP.w, height: LAPTOP.h, border: 0, transform: `scale(${LAPTOP.scale})`, transformOrigin: "top left" }}
              />
            </div>
          </div>
        </DeviceFrame>

        {taps.map((t) => (
          <span
            key={t.id}
            className="pointer-events-none absolute size-14 animate-ping rounded-full bg-white/60 ring-4 ring-white/80"
            style={{ left: t.x - 28, top: t.y - 28 }}
          />
        ))}
      </div>

      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-[#0b1120]/80">
          <span className="flex items-center gap-2 text-lg text-white">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading the demo database…
          </span>
        </div>
      )}
    </div>
  );

  if (present) {
    return (
      <main className="relative flex min-h-dvh flex-col bg-[#0b1120] text-white">
        <div className="flex h-24 items-center justify-center">
          {chapter && <span className="rounded-full bg-white/10 px-5 py-2 text-2xl font-medium">{chapter}</span>}
        </div>
        {stage}
        <div className="flex flex-1 items-center justify-center px-10 pb-6">
          {caption && (
            <p key={caption} className="animate-result max-w-[1500px] rounded-2xl bg-black/60 px-8 py-4 text-center text-[34px] leading-snug font-medium">
              {caption}
            </p>
          )}
        </div>
        {csv && <CsvPreview rows={csv} onClose={() => setCsv(null)} />}
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0b1120] pb-10 text-white">
      <header className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo subtitle="Live demo: night attendance without knocking on every door" />
        <a href={REPO_URL} className="inline-flex items-center gap-1.5 text-sm text-[#93c5fd] hover:underline">
          Source code and docs <ExternalLink className="size-4" aria-hidden />
        </a>
      </header>

      <section className="mx-auto max-w-[1800px] px-4 sm:px-6">
        <p className="max-w-3xl text-[#c7cfdd]">
          This is the real NightPass app with sample data, running entirely in your browser. Follow the steps below and watch
          the student&apos;s phone, the warden&apos;s phone and the dashboard. You can also tap around inside any of the screens.
        </p>

        {!small && (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <ControlGroup step="1" title="In the room, before curfew">
              <label className="flex h-10 items-center gap-2 rounded-lg bg-white/5 px-3 text-sm ring-1 ring-white/10">
                Student
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="bg-transparent font-medium outline-none" aria-label="Which student">
                  {DEMO_STUDENTS.map((st) => (
                    <option key={st.id} value={st.id} className="bg-[#131b2e]">
                      {st.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => roomCheckIn()} disabled={!ready} className={`${controlBtn} bg-[#2563eb] text-white hover:bg-[#1d4ed8]`}>
                <DoorOpen className="size-4" aria-hidden /> {firstName} checks in from the room
              </button>
              <span className="w-full text-sm text-[#8b95a8]">Or try to cheat:</span>
              <button onClick={() => roomCheckIn({ nextDoor: true })} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                From the room next door
              </button>
              <button onClick={() => roomCheckIn({ offCampus: true })} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                From outside the hostel
              </button>
              <button onClick={() => roomCheckIn({ otherPhone: true })} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                From a friend&apos;s phone
              </button>
              <button onClick={() => roomCheckIn({ wrongFinger: true })} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                With someone else&apos;s finger
              </button>
            </ControlGroup>

            <ControlGroup step="2" title="At the gate, for late arrivals">
              <button onClick={() => showPass(0)} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                <ScanLine className="size-4" aria-hidden /> Hold {firstName}&apos;s pass up to the scanner
              </button>
              <button onClick={() => showPass(6)} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                Use an old screenshot
              </button>
              <button onClick={() => setOffline(!offline)} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                {offline ? <WifiOff className="size-4 text-[#fbbf24]" aria-hidden /> : <Wifi className="size-4" aria-hidden />}
                {offline ? "Scanner is offline (tap to reconnect)" : "Take the scanner offline"}
              </button>
              <span className="w-full text-sm text-[#8b95a8]">No phone? Use Manual entry on the guard&apos;s phone.</span>
            </ControlGroup>

            <ControlGroup step="3" title="After curfew: the warden's rounds">
              <button onClick={curfewPasses} disabled={!ready} className={`${controlBtn} bg-[#2563eb] text-white hover:bg-[#1d4ed8]`}>
                <Clock className="size-4" aria-hidden /> Curfew passes: start the rounds
              </button>
              <span className="w-full text-sm text-[#8b95a8]">
                Then tap In room or Not in room on the warden&apos;s phone, and open Hostel map on the dashboard.
              </span>
            </ControlGroup>

            <ControlGroup step="4" title="Emergency at night">
              <button onClick={startHeadcount} disabled={!ready} className={`${controlBtn} bg-[#b91c1c] text-white hover:bg-[#991b1b]`}>
                <Siren className="size-4" aria-hidden /> Fire alarm: start a headcount
              </button>
              <button onClick={() => tap("student", "I'm safe")} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                {firstName} taps I&apos;m safe
              </button>
              <button onClick={evacuate} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                Other students reach the assembly point
              </button>
              <button onClick={() => showPass(0)} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                Scan {firstName}&apos;s pass at the assembly point
              </button>
              <button onClick={endHeadcount} disabled={!ready} className={`${controlBtn} bg-white/10 hover:bg-white/15`}>
                End headcount
              </button>
              <button onClick={reset} disabled={!ready} className={`${controlBtn} ml-auto text-[#c7cfdd] hover:bg-white/10`}>
                <RotateCcw className="size-4" aria-hidden /> Reset demo
              </button>
            </ControlGroup>
          </div>
        )}
      </section>

      {small ? (
        <section className="mx-auto mt-6 flex max-w-md flex-col gap-3 px-4">
          <p className="text-sm text-[#c7cfdd]">
            On a phone, open one screen at a time. Try the gate scanner on one phone and a student pass on another: the
            scanner will read it with the real camera. The side-by-side demo needs a laptop screen.
          </p>
          {[
            { href: "/student/", title: "Student", text: "Room check-in and gate pass" },
            { href: "/guard/", title: "Guard / warden", text: "Gate scanner and room rounds" },
            { href: "/admin/", title: "Warden dashboard", text: "Best on a laptop" },
          ].map((link) => (
            <a key={link.href} href={`${BASE_PATH}${link.href}`} className="flex items-center gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <Smartphone className="size-5 text-[#93c5fd]" aria-hidden />
              <span>
                <span className="block font-medium">{link.title}</span>
                <span className="block text-sm text-[#c7cfdd]">{link.text}</span>
              </span>
            </a>
          ))}
        </section>
      ) : (
        <div className="mt-8">{stage}</div>
      )}

      {!small && (
        <p className="mx-auto mt-6 max-w-[1800px] px-4 text-sm text-[#8b95a8] sm:px-6">
          The two phones here use simulated cameras, because a webcam can&apos;t see things drawn on the same screen, and the
          student&apos;s phone has a simulated fingerprint sensor (it signs with a real passkey format, checked the same way). The demo
          roll call always runs now, with curfew about 25 minutes away, whatever time you open it. Open
          the{" "}
          <a className="underline" href={`${BASE_PATH}/guard/`}>
            gate scanner
          </a>{" "}
          on a real phone to scan with its camera, and a{" "}
          <a className="underline" href={`${BASE_PATH}/student/`}>
            student pass
          </a>{" "}
          on another phone.
        </p>
      )}
      {csv && <CsvPreview rows={csv} onClose={() => setCsv(null)} />}
    </main>
  );
}

const controlBtn = "inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium disabled:opacity-50";

function ControlGroup({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-[#2563eb] text-xs">{step}</span>
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
const phoneFrameStyle = {
  width: PHONE.w,
  height: PHONE.h,
  border: 0,
  transform: `scale(${PHONE.scale})`,
  transformOrigin: "top left",
} as const;

function DeviceFrame({ label, dim, lit, children }: { label: string; dim: boolean; lit: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 transition-opacity duration-500" style={{ opacity: dim ? 0.35 : 1 }}>
      <div className={`text-center text-lg font-medium ${lit ? "text-white" : "text-[#8b95a8]"}`}>{label}</div>
      <div className={`rounded-[50px] transition-shadow duration-500 ${lit ? "shadow-[0_0_0_6px_rgba(96,165,250,0.55)]" : ""}`}>{children}</div>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[50px] bg-[#16181d] p-[10px] shadow-2xl ring-1 ring-white/10">
      <div className="overflow-hidden rounded-[40px]" style={{ width: PHONE.w * PHONE.scale, height: PHONE.h * PHONE.scale }}>
        {children}
      </div>
    </div>
  );
}

function CsvPreview({ rows, onClose }: { rows: string[][]; onClose: () => void }) {
  const [header, ...body] = rows;
  const cols = [0, 1, 3, 4, 5, 7, 9, 10];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-[1500px] overflow-hidden rounded-xl bg-white text-[#1b2230] shadow-2xl">
        <div className="flex items-center justify-between bg-[#107c41] px-5 py-3 text-white">
          <span className="text-lg font-semibold">nightpass-records.csv</span>
          <span className="text-sm opacity-90">Exported from NightPass, opens in Excel</span>
        </div>
        <table className="w-full border-collapse text-left text-[17px]">
          <thead>
            <tr className="bg-[#f1f3f5]">
              {cols.map((c) => (
                <th key={c} className="border border-[#d9dde3] px-3 py-2 font-semibold">
                  {header?.[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className="max-w-[420px] truncate border border-[#d9dde3] px-3 py-1.5">
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
