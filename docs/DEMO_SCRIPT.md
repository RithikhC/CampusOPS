# Demo video

**File:** [NightPass-demo.mp4](NightPass-demo.mp4) (2 minutes 54 seconds, 1080p, captions, no narration)

The submission asks the video to cover the problem and our solution, a working demo, the user flow, our technical choices and the impact. The demo part is organised around what Problem Statement 03 asks for (record, verify, review, flag), so each requirement can be seen working. The emergency headcount add-on comes last and is kept short.

| Time | Section | What's shown |
| --- | --- | --- |
| 0:00 | Title | NightPass: night attendance scanning |
| 0:03 | The problem | Recording night attendance by hand is slow, inconsistent and hard to consolidate: every room walked, paper registers, records nobody can search, nobody knows who's missing |
| 0:13 | Our solution | A night attendance scanning system to record, verify and review presence. The add-on is mentioned in one line |
| 0:22 | User and usage flow | Scan, verify, record, review |
| 0:30 | Live demo | Recorded from the web demo, with captions (details below) |
| 2:25 | Meeting the brief | Each requirement from the problem statement and how it's met |
| 2:33 | Technical choices | What it's built with, and why entries are hard to fake |
| 2:42 | Impact and feasibility | 150 doors down to about 35, no queue, every attempt on record, one sticker per room |
| 2:50 | End card | Live demo link and GitHub link |

## The live demo section

It was recorded from the web demo (https://rithikhc.github.io/CampusOPS/?present), with the student's phone, the guard / warden's phone and the warden's dashboard on screen together. The phones use simulated cameras and a simulated fingerprint sensor, and a note in the corner of the video says so. The clock in the recording starts at 22:05, with curfew at 22:30.

| Time | Chapter (requirement) | Case shown | Result |
| --- | --- | --- | --- |
| 0:30 | Record: scanning in from the room | Aarav scans the tag on his door and confirms with his fingerprint | Checked in, with the time and place, and counted on the dashboard straight away |
| 0:42 | Verify: every entry is checked | Fatima tries from a café | Refused: not on the hostel Wi-Fi |
| | | From the room next door | Refused: wrong room |
| | | On a friend's phone | Refused: not her registered phone |
| | | Rohan's roommate tries on Rohan's phone | Refused: fingerprint doesn't match |
| | | | Every refusal is recorded and flagged |
| 1:07 | Record: scanning at the gate | Fatima comes back late | One scan: recorded as late, with the time |
| | | The guard's phone has no signal | The scan still works and uploads when the signal is back |
| 1:19 | Flagged: duplicate, invalid and incomplete entries | The same pass scanned twice | Duplicate |
| | | A screenshot of a pass | Expired code |
| | | A pass for someone not on the student list | Not on roster |
| | | Rohan has no phone, so the guard enters him by hand | Counted, but flagged for review |
| 1:39 | Follow-up: the warden's rounds | The list after curfew: 35 rooms, not 150, each with its reason | |
| | | A spot check, student in the room | One tap: In room |
| | | A spot check, student not there | One tap cancels the room check-in and flags it |
| 1:52 | Review, search and export | The hostel map | Every room, coloured by status |
| | | Search for Fatima | Every entry with its date, time, place and result |
| | | Needs review | The cancelled check-in is closed with a note |
| | | Export | Records open in Excel (CSV) |
| 2:11 | Add-on: emergency headcount | Fire alarm: the warden starts a headcount, Aarav taps I'm safe, other students report in | The dashboard shows who is safe and which rooms to check first |

## Re-recording with real phones (optional)

A version filmed on real phones would make the demo even more convincing. If there's time:

- Print one room tag from the warden dashboard (**Students**, then **Room tags**) and stick it on a door.
- Run the full app with a server over https so the phones, the fingerprint check and the dashboard work together (see [DEPLOYMENT.md](DEPLOYMENT.md#testing-on-a-phone-during-development)).
- Film a phone scanning the tag on the door and the real fingerprint prompt, and cut that shot into the existing video in place of the room check-in at about 0:30.
- Record a voice-over if you like. The captions in the video work as a script.
- Keep the total under 3 minutes.
