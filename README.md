# NightPass

Night attendance for hostels, without knocking on every door. Built for the CampusOps Hackathon (Problem Statement 03: Nighttime Attendance & Presence Scanning, Campus Operations / Security).

**Live demo:** https://rithikhc.github.io/CampusOPS/ (opens in any browser, nothing to install)
**Demo video (2:55):** [docs/NightPass-demo.mp4](docs/NightPass-demo.mp4). It shows every feature and every case below.

![Warden dashboard](docs/screenshots/admin-dashboard.png)

| Check in from the room | Confirm with a fingerprint | Warden's rounds | Fire alarm headcount |
| --- | --- | --- | --- |
| <img src="docs/screenshots/student-pass.png" width="200" alt="Student screen with the Check in from my room button"> | <img src="docs/screenshots/fingerprint.png" width="200" alt="Fingerprint prompt after scanning the door tag"> | <img src="docs/screenshots/guard-rounds.png" width="200" alt="The warden's list of rooms to visit"> | <img src="docs/screenshots/student-emergency.png" width="200" alt="Emergency alert on the student's phone"> |

## The problem

Today a warden walks to every room, every night, to see who is in. In a hostel of 150 students that's 150 doors, one by one. Students who are in their room get disturbed anyway, the record is on paper (if there is one), and nobody knows who is missing until the round is over. And if the fire alarm goes off at 2 AM, nobody knows who is still inside.

## Our idea

Most students are in their room at curfew. They shouldn't need a knock, and the warden's time should go to the rooms where there's actually a question. NightPass does four things.

**1. Students check in from their own room, with their fingerprint.** They tap **Check in from my room**, scan the NightPass tag stuck on the back of their door, and confirm with their fingerprint or face. The check-in only counts with four proofs together:

- the **right person**: the phone's own fingerprint or face check, through a passkey. No biometric data ever leaves the phone. A roommate holding your phone can't pass it.
- the **right phone**: the one registered to that student. A friend's phone is refused.
- the **right room**: the signed tag of their own room. The room next door's tag is refused.
- the **right place and time**: on the hostel Wi-Fi (from a café it's refused), in the check-in window around curfew

Every refused attempt is recorded, so the warden sees it.

**2. The warden only visits the rooms that need a look.** After curfew the warden's phone shows a walking list, sorted by block and room:

- students who **haven't checked in**
- **spot checks** on room check-ins that are less certain: a refused attempt tonight, no fingerprint check, a new phone, or missed nights this week
- a small **random sample**, so nobody can count on never being checked

At each door it's one tap: **In room** or **Not in room**. "Not in room" for someone who checked in cancels their check-in and flags it. In our sample hostel that's **about 35 rooms instead of 150**.

**3. Late arrivals use the gate.** Students coming back after curfew show a QR pass that changes every 15 seconds (so a screenshot is useless), and a guard scans it with any phone, even with no signal at the gate. A student without their phone is found by name and flagged for review.

**4. Emergency headcount.** If the fire alarm goes off, the warden starts a headcount in one tap. Every student's phone gets the alert and they tap **I'm safe** or **I need help**. Guards scan passes at the assembly point. The dashboard shows who is safe, who needs help, and, because it knows who checked in tonight, **which rooms to check first**: the students who are probably still inside.

The warden's dashboard shows all of it live: who is in, how each student was confirmed, a **map of every room** coloured by status, the rounds and their progress, anything that needs review, and exports to Excel.

| Hostel map | Emergency headcount on the dashboard |
| --- | --- |
| <img src="docs/screenshots/admin-map.png" alt="Map of every room, coloured by status"> | <img src="docs/screenshots/admin-emergency.png" alt="Emergency headcount: safe, needs help, rooms to check first"> |

## Trying the live demo

The [live demo](https://rithikhc.github.io/CampusOPS/) shows the student's phone, the warden's phone and the dashboard side by side. It's the same app running entirely in your browser with sample data, so every visitor gets their own copy. The buttons at the top follow one night:

1. **In the room, before curfew.** Press **Aarav checks in from the room**: his phone scans the door tag and asks for his fingerprint. Then try to cheat: from the room next door, from outside the hostel, from a friend's phone, or with someone else's finger. Each one is refused and shows up on the dashboard.
2. **At the gate.** Hold a pass up to the scanner, use an old screenshot, take the scanner offline, or use **Manual entry** on the guard's phone.
3. **After curfew.** Press **Curfew passes: start the rounds**, tap **In room** or **Not in room** on the warden's phone, and open **Hostel map** on the dashboard.
4. **Emergency.** Start a fire-alarm headcount, tap **I'm safe** on the student's phone, scan a pass at the assembly point, and let the other students reach the assembly point.

The phones in the demo use simulated cameras and a simulated fingerprint sensor (it answers with a real passkey response, which is checked the same way). On a real phone you can open the [student screen](https://rithikhc.github.io/CampusOPS/student/) or the [gate scanner](https://rithikhc.github.io/CampusOPS/guard/) on its own and use the real camera.

## Meeting the requirements

| The problem statement asks for | What we did |
| --- | --- |
| A quick, dependable way to record presence | One scan of the room tag plus a fingerprint, from the student's own phone, or one scan at the gate. The guard's result is worked out on the phone in milliseconds. |
| Verify each entry against university identity data | The student's fingerprint or face on their registered phone (passkey), room tags and passes signed by the university's key, and a check against the active student list. |
| Record date, time and other details | Every attempt is saved with the time, the place (room, gate or rounds), who recorded it, the method, whether a fingerprint was used, the result and the reason. |
| Let staff review, search and export | Live dashboard, hostel map, the rounds list, search and filters, and CSV export of the records, the "not back yet" list and emergency headcounts. |
| Find duplicate, invalid or incomplete entries | Flags for refused room check-ins (wrong person, wrong phone, outside the hostel, wrong room), expired or forged codes, duplicates, late arrivals, manual entries, and students not found in their room. The warden resolves each one with a note. |
| Protect student data and limit access | Separate student, guard and warden roles, checked on every page and every API call. Students only see their own record. No biometric data is stored anywhere. |
| Work reliably at night | Dark screens, a torch button, the screen stays on, sound and vibration, an offline gate scanner, and an emergency headcount for night-time incidents. |
| Keep delays low | Students who are already in don't queue anywhere, and there is no typing on any screen. |
| Connect to existing university systems | The student list is imported from a CSV export of the student records system. The hostel network check uses the campus Wi-Fi address ranges. Sign-in is set up so the demo accounts can be swapped for the university's Google accounts. |

## Running it locally

You need Node.js 20.9 or newer. Nothing else needs to be installed or configured.

```bash
git clone https://github.com/RithikhC/CampusOPS.git
cd CampusOPS
npm install
npm run dev
```

Then open http://localhost:3000 and pick one of the demo accounts. On first start the app creates a small built-in database (in the `.data` folder) with 150 sample students across three hostel blocks, tonight's roll call already in progress, and six earlier nights of history.

### Trying the full flow

1. **Warden:** sign in as Dr. Meera Nair. Open **Students**, then **Room tags**. These are the stickers that go inside each room, ready to print. Under **Settings** you can move tonight's curfew.
2. **Student:** sign in as Aarav Mehta in another browser window or on a phone, and tap **Check in from my room**. Scan the A-214 tag, or press **Copy code** under that tag on the warden's page and paste it in. The browser then asks for your fingerprint, face or device PIN (Windows Hello, Touch ID, Android or iPhone). The first time, this sets up the passkey. On a device with no fingerprint, face or PIN lock the check-in still goes through, but it's marked for a spot check. The button opens 90 minutes before curfew.
3. **Rounds:** once curfew has passed, sign in as the guard (Ravi Kumar), open **Room rounds**, and mark rooms **In room** or **Not in room**.
4. **Gate:** under **Gate scan**, scan a student's pass, or use **Manual entry** and **Type / paste code**. After curfew it comes up as late.
5. **Emergency:** on the dashboard press **Emergency headcount**. The student's phone shows the alert, the guard's phone switches to the assembly point scanner, and the dashboard shows the rooms to check first.
6. Back on the dashboard, look at **Hostel map**, **Room rounds**, **Not back yet**, **Needs review** and **Search & export**.

Phones only allow the camera and passkeys on https pages, so to use a real phone either use the live demo or follow the tunnel instructions in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#testing-on-a-phone-during-development).

To start again with fresh data, go to **Settings** on the warden dashboard and press **Reset demo data**.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app on port 3000 |
| `npm test` | Runs the 51 automated tests (passkeys, tag and pass signing, scan rules, room check-in, rounds, emergency headcount, demo data) |
| `npm run lint` and `npm run typecheck` | Code checks |
| `npm run build` then `npm start` | Production build |
| `npm run keys` | Generates the secret keys needed when deploying |
| `npm run build:pages` then `npm run preview:pages` | Builds the browser-only demo (the GitHub Pages version) and serves it at http://localhost:4000/CampusOPS/ |

## Documents

- [Technical overview](docs/TECHNICAL.md): architecture, the passkey check, room check-in rules, how the rounds list is built, the emergency headcount, the gate pass, offline sync, data model, API and security
- [Deployment guide](docs/DEPLOYMENT.md): setting up a hostel, GitHub Pages, Vercel with a free Postgres database, any Node host, Docker, and testing on a phone
- [Demo video](docs/NightPass-demo.mp4): 2 minutes 55 seconds, with captions
- [What's in the video](docs/DEMO_SCRIPT.md)

## Tech stack

- **Next.js 16 with React 19 and TypeScript**: every screen and the API in one project. The app can be added to a phone's home screen.
- **PostgreSQL**: PGlite (Postgres that runs inside Node) for local use, so there's nothing to install, and any hosted Postgres in production. Same SQL for both.
- **Passkeys (WebAuthn)** for the fingerprint check. The phone keeps the private key in its secure hardware and only uses it after its own fingerprint, face or PIN check. The server stores the public key and checks a P-256 signature (`@noble/curves`) on every check-in.
- **Ed25519 signatures** (`@noble/curves`) for room tags and gate passes. The server keeps the private key. Phones only get the public key, so a guard's phone can check a pass offline but nobody can make their own tag or pass.
- **Scanning**: the browser's built-in barcode detector where it exists (Android), and `jsQR` everywhere else (iPhone).
- **Tailwind CSS** for styling, `lucide-react` icons, `jose` for signed session cookies.
- **Vitest** for tests, ESLint, and a GitHub Actions workflow that runs lint, type check, tests and a build on every push.
- **GitHub Pages demo**: a static build of the same screens where the API runs in the browser on PGlite (Postgres compiled to WebAssembly). A second workflow republishes it on every push. See [the technical overview](docs/TECHNICAL.md#the-browser-demo-github-pages).

## Project layout

```
src/
  app/
    page.tsx            sign-in page
    student/            student screen, room check-in, emergency alert
    guard/              gate scanner, room rounds, headcount at the assembly point, manual entry
    admin/              warden dashboard, hostel map, emergency panel
    api/                server routes (sign-in, pass, check-in, safety, scans, rounds, emergency, admin)
  components/           camera scanner, passkey (fingerprint) client, QR code, sound/vibration, shared UI
  lib/
    roomcheck.ts        room check-in rules (the four proofs)
    webauthn.ts         passkey checks: challenges and signature verification
    rounds.ts           who goes on the warden's list, and recording visits
    emergency.ts        emergency headcount
    roomtag.ts          signed room tags
    network.ts          hostel network check
    pass.ts             gate pass format and signing (used by server and phone)
    verify.ts           gate scan rules (used by server and phone)
    scans.ts            saving gate scans on the server
    queries.ts          data for each screen, including the hostel map
    admin.ts            warden actions (resolve, curfew, import, room tags)
    db.ts, schema.ts    database connection and tables
    seed.ts             demo data
  demo/                 browser-only demo: in-browser API, simulated cameras and fingerprint sensor, side-by-side page
  proxy.ts              blocks pages a role shouldn't see
tests/                  automated tests
docs/                   technical overview, deployment guide, demo video
```

## Privacy and security

- **No biometric data is collected.** The fingerprint or face check happens inside the phone, the same way it unlocks. NightPass only receives a signature that proves the check passed.
- Only the server can create room tags and passes. A gate pass expires within about 30 seconds, and editing a tag or a pass breaks its signature.
- The hostel network check looks at the address the request arrives from, which is decided by the server and not by the phone.
- Each role only gets what it needs. Guards don't see emails. Students only see their own record. Warden pages and APIs are blocked for everyone else.
- Every attempt is stored, including refused ones, with who or what recorded it. Warden actions such as resolving a flag, changing curfew, importing students and running a headcount are logged too.

The limits of each check, and what covers them, are listed in the [technical overview](docs/TECHNICAL.md#security).

## Expected impact

These figures come from our sample data. A two-week pilot in one hostel block would measure them for real.

- **Rounds:** about 35 rooms to visit instead of 150 on a typical night, in walking order, with the reason for each.
- **Students who are in** aren't disturbed.
- **At curfew** the warden already knows who hasn't checked in, before the round starts.
- **In an emergency** the warden knows within minutes who is safe, who needs help and which rooms to check first, instead of counting heads on a list.
- **Cheating gets harder than it is today:** a friend can't check in for you, not even with your phone, check-ins from outside the hostel are refused and recorded, and nobody can predict the spot checks.
- **Cost:** one printed sticker per room. Everything else runs on phones people already have.

## What we'd add next

- Sign in with university Google accounts
- Push notifications, so the emergency alert reaches phones even when NightPass isn't open
- Alerts to the warden for students still missing 30 minutes after curfew
- Automatic student list sync instead of CSV upload
- Linking with approved leave / outpasses so those students aren't marked missing
- Adjusting the spot-check rate per hostel, based on how often a spot check finds an empty room

## License

MIT
