# Demo video

**File:** [NightPass-demo.mp4](NightPass-demo.mp4) (2 minutes 55 seconds, 1080p, captions, no narration)

The submission asks the video to cover the problem and our solution, a working demo, the user flow, our technical choices and the impact. Here's what's in it. The demo part shows every feature and every case the app handles, so nothing needs to be explained outside the video.

| Time | Section | What's shown |
| --- | --- | --- |
| 0:00 | Title | NightPass: night attendance without knocking on every door |
| 0:03 | The problem | Every night a warden walks to every room. 150 doors, students disturbed, paper records, nobody knows who's missing until the round is over |
| 0:13 | Our solution | Students check in from their room with a fingerprint, the warden visits only where needed, the dashboard, and the emergency headcount |
| 0:22 | Live demo | Recorded from the web demo, with captions (details below) |
| 2:18 | User and usage flow | One night: before curfew, the four proofs, after curfew, if the alarm goes off |
| 2:26 | Meeting the brief | Each requirement from the problem statement and how it's met |
| 2:34 | Technical choices | What it's built with, and why it's hard to cheat |
| 2:43 | Impact and feasibility | 150 doors down to about 35, no knock for students who are in, emergencies, one sticker per room |
| 2:51 | End card | Live demo link and GitHub link |

## The live demo section

It was recorded from the web demo (https://rithikhc.github.io/CampusOPS/?present), with the student's phone, the guard / warden's phone and the warden's dashboard on screen together. The phones use simulated cameras and a simulated fingerprint sensor, and a note in the corner of the video says so. The clock in the recording starts at 22:05, with curfew at 22:30.

| Time | Chapter | Case shown | Result |
| --- | --- | --- | --- |
| 0:22 | 22:05. Checking in from the room | Aarav scans the tag on his door and confirms with his fingerprint | Checked in, no knock. The dashboard count goes up. |
| 0:33 | Trying to cheat | Fatima tries from a café | Refused: not on the hostel Wi-Fi |
| | | She tries from a friend's room next door | Refused: wrong room's tag |
| | | Her friend tries for her on his own phone | Refused: not her registered phone |
| | | Rohan's roommate tries on Rohan's phone, left in the room | Refused: fingerprint not recognised |
| | | | Every refusal is recorded for the warden |
| 0:59 | 22:42. Late arrivals at the gate | Fatima comes back late and shows her pass | Late |
| | | The same pass scanned again | Already scanned (duplicate) |
| | | A screenshot of someone's pass | Expired code |
| | | The guard's phone loses signal and scans a late student | Works offline, uploads when the signal is back |
| | | Rohan has no phone, so the guard finds him by name | Marked present, flagged for review |
| 1:26 | The warden's rounds | The list after curfew: 35 rooms, not 150, each with its reason | |
| | | A spot check, student in the room | One tap: In room |
| | | A spot check, student not there | One tap cancels the room check-in and flags it |
| 1:38 | In the warden's office | The hostel map | Every room, coloured by status |
| | | Needs review | The cancelled check-in is resolved with a note |
| | | Search & export | Records export to Excel (CSV) |
| 1:56 | 00:50. The fire alarm goes off | The warden starts an emergency headcount | Every phone gets the alert |
| | | Aarav taps I'm safe | Counted as safe |
| | | A guard scans Fatima's pass at the assembly point | Counted as safe |
| | | Other students reach the assembly point | The dashboard shows who is safe, who needs help, and which rooms to check first |

## Re-recording with real phones (optional)

A version filmed on real phones would make the demo even more convincing. If there's time:

- Print one room tag from the warden dashboard (**Students**, then **Room tags**) and stick it on a door.
- Run the full app with a server over https so the phones, the fingerprint check and the dashboard work together (see [DEPLOYMENT.md](DEPLOYMENT.md#testing-on-a-phone-during-development)).
- Film a phone scanning the tag on the door and the real fingerprint prompt, and cut that shot into the existing video in place of the room check-in at about 0:22.
- Record a voice-over if you like. The captions in the video work as a script.
- Keep the total under 3 minutes.
