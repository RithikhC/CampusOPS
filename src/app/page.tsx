import { ArrowRight, ListChecks, QrCode, Smartphone } from "lucide-react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { DEMO_STUDENT_IDS } from "@/lib/seed";
import { HOME_FOR_ROLE } from "@/lib/session";
import { DemoLoginButton } from "./DemoLoginButton";
import { Logo } from "@/components/ui";

export default async function Home() {
  const [user, db] = await Promise.all([getSessionUser(), getDb()]);
  const [students, staff] = await Promise.all([
    db.query<{ id: string; name: string; hostel: string; room: string }>(
      `select id, name, hostel, room from students where id = any($1::text[]) order by array_position($1::text[], id)`,
      [DEMO_STUDENT_IDS],
    ),
    db.query<{ id: string; name: string; role: "guard" | "admin"; title: string }>(
      `select id, name, role, title from staff where id in ('admin-1', 'guard-1')`,
    ),
  ]);
  const guard = staff.find((s) => s.role === "guard");
  const admin = staff.find((s) => s.role === "admin");

  return (
    <div className="theme-light min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-14">
        <Logo subtitle="Hostel night attendance" />

        <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-[1fr_400px] lg:grid-rows-[auto_1fr] lg:gap-x-12">
          <div className="lg:col-start-1 lg:row-start-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Night attendance without the paper register.</h1>
            <p className="mt-3 max-w-xl text-muted">
              Students show a QR pass on their phone at the hostel gate. Security scans it, and the warden can see who is
              back and who isn&apos;t.
            </p>
          </div>

          <section
            className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
            aria-labelledby="sign-in"
          >
            <h2 id="sign-in" className="text-lg font-semibold">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-muted">
              This is the demo version, so pick one of the test accounts below. The real system would use your university
              Google account.
            </p>

            {user && (
              <Link
                href={HOME_FOR_ROLE[user.role]}
                className="mt-4 flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2.5 text-sm font-medium text-brand"
              >
                Continue as {user.name}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}

            <AccountGroup title="Students" hint="See your QR pass">
              {students.map((s) => (
                <DemoLoginButton key={s.id} id={s.id} label={s.name} detail={`${s.hostel}, room ${s.room}`} disabled={!config.demoMode} />
              ))}
            </AccountGroup>

            <AccountGroup title="Security" hint="Scan students at the gate">
              {guard && <DemoLoginButton id={guard.id} label={guard.name} detail={guard.title} disabled={!config.demoMode} />}
            </AccountGroup>

            <AccountGroup title="Warden" hint="Dashboard, reports and exports">
              {admin && <DemoLoginButton id={admin.id} label={admin.name} detail={admin.title} disabled={!config.demoMode} />}
            </AccountGroup>
          </section>

          <ul className="flex max-w-xl flex-col gap-5 lg:col-start-1 lg:row-start-2">
            <Point icon={<Smartphone className="size-5" />} title="Scan with any phone">
              No extra hardware. The scanner keeps working when the gate has no signal.
            </Point>
            <Point icon={<QrCode className="size-5" />} title="Passes can't be shared">
              The QR changes every 15 seconds, so a screenshot sent to a friend won&apos;t work.
            </Point>
            <Point icon={<ListChecks className="size-5" />} title="Know who's missing at curfew">
              A live list of students who haven&apos;t checked in, which you can export to Excel.
            </Point>
          </ul>
        </div>
      </main>
    </div>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

function AccountGroup({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
