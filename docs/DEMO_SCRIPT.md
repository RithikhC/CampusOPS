# Demo video

**File:** [NightPass-demo.mp4](NightPass-demo.mp4) (2 minutes 48 seconds, 1080p, captions, no narration)

The submission asks the video to cover the problem and our solution, a working demo, the user flow, our technical choices and the impact. Here's what's in it.

| Time | Section | What's shown |
| --- | --- | --- |
| 0:00 | Title | NightPass, CampusOps Hackathon, Problem Statement 03 |
| 0:04 | The problem | "Is every student back?" and what goes wrong with a paper register |
| 0:15 | Our solution | The three screens: student pass, guard scanner, warden dashboard |
| 0:24 | Live demo | Recorded from the web demo, with captions (details below) |
| 2:01 | User and usage flow | Student's phone, guard's phone, server, warden's dashboard |
| 2:15 | Meeting the brief | Each requirement from the problem statement and how it's met |
| 2:24 | Technical choices | Stack, and why passes can't be faked |
| 2:35 | Impact | Time at the gate, queue at curfew, missing list, no hardware |
| 2:44 | End card | Live demo link and GitHub link |

## The live demo section

It was recorded from the web demo (https://rithikhc.github.io/CampusOPS/?present), with the student's phone, the guard's phone and the warden's dashboard on screen together. The guard phone uses a simulated camera, and a note in the corner of the video says so.

1. Aarav opens his pass. The QR changes every 15 seconds.
2. The guard taps Start scanning and scans it. Green, "Checked in". Aarav's phone confirms it and the dashboard count goes up.
3. The same pass is scanned again. Red, "Already scanned".
4. A friend shows an old screenshot of Fatima's pass. Red, "Expired code".
5. The guard phone loses signal. Fatima's live pass still checks in, and the scan is saved on the phone. When the signal comes back, it uploads.
6. Rohan's phone is dead. The guard finds him with Manual entry, picks "Phone battery dead" and marks him present (amber, flagged for review).
7. The warden looks at **Not back yet** (students with a rejected scan are listed first), resolves an item in **Needs review** with a note, and exports the records to Excel.

## Re-recording with real phones (optional)

A version filmed on real phones would make the demo even more convincing. If there's time:

- Use the live demo links: the [gate scanner](https://rithikhc.github.io/CampusOPS/guard/) on one phone and a [student pass](https://rithikhc.github.io/CampusOPS/student/) on another. Each phone runs its own copy of the demo data, but the scanner can still read and check any student's pass. For the dashboard to update live across devices, use the full app with a server (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- Film one real phone scanning another in a dim room, and cut that shot into the existing video in place of the 0:35 to 0:45 scan.
- Record a voice-over if you like. The captions in the video work as a script.
- Keep the total under 3 minutes.
