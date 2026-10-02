# Demo video

**File:** [NightPass-demo.mp4](NightPass-demo.mp4) (2 minutes 43 seconds, 1080p, captions, no narration)

The submission asks the video to cover the problem and our solution, a working demo, the user flow, our technical choices and the impact. Here's what's in it.

| Time | Section | What's shown |
| --- | --- | --- |
| 0:00 | Title | NightPass: night attendance without knocking on every door |
| 0:04 | The problem | Every night a warden walks to every room. 150 doors, students disturbed, paper records, nobody knows who's missing until the round is over |
| 0:15 | Our solution | Students check in from their room. The warden visits only where needed. The three screens |
| 0:26 | Live demo | Recorded from the web demo, with captions (details below) |
| 1:53 | User and usage flow | One night with NightPass: before curfew, the three proofs, after curfew, in the office |
| 2:08 | Meeting the brief | Each requirement from the problem statement and how it's met |
| 2:17 | Technical choices | What it's built with, and why it's hard to cheat |
| 2:28 | Impact and feasibility | 150 doors down to about 30, no knock for students who are in, one sticker per room |
| 2:39 | End card | Live demo link and GitHub link |

## The live demo section

It was recorded from the web demo (https://rithikhc.github.io/CampusOPS/?present), with the student's phone, the warden's phone and the warden's dashboard on screen together. The two phones use simulated camera feeds, and a note in the corner of the video says so. The clock in the recording starts at 22:05, with curfew at 22:30.

1. **Checking in from the room.** Aarav taps **Check in from my room** and points his phone at the tag on the back of his door. He's checked in, and the count on the warden's dashboard goes up.
2. **Trying to cheat.** Fatima is still out. She tries to check in from a café: refused, she isn't on the hostel Wi-Fi. A friend in the hostel tries for her from his own phone: refused, it isn't her registered phone. Both attempts show up on the dashboard.
3. **22:42, curfew has passed.** Fatima comes back and shows her pass at the gate. It's scanned and marked late. Then someone shows an old screenshot of a pass: expired.
4. **The warden's rounds.** The warden's phone lists the rooms to visit, far fewer than 150: students with no check-in, plus spot checks. One student is in the room (one tap). Another checked in from the room but isn't there now: one tap cancels the check-in and flags it.
5. **In the office.** The dashboard shows how each student was confirmed and how the rounds went. The warden resolves the flagged check-in with a note and exports the records to Excel.

## Re-recording with real phones (optional)

A version filmed on real phones would make the demo even more convincing. If there's time:

- Print one room tag from the warden dashboard (**Students**, then **Room tags**) and stick it on a door.
- Run the full app with a server so the phones and the dashboard share data (see [DEPLOYMENT.md](DEPLOYMENT.md#testing-on-a-phone-during-development)).
- Film a phone scanning the tag on the door, and cut that shot into the existing video in place of the room check-in at about 0:30.
- Record a voice-over if you like. The captions in the video work as a script.
- Keep the total under 3 minutes.
