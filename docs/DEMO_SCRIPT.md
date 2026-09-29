# Demo video plan (under 3 minutes)

The video needs to cover the problem and our solution, a working demo, the user flow, our technical choices and the impact. This plan does that in about 2 minutes 55 seconds.

## Setting up

- Use the deployed https link, because the phone camera needs https. Laptop: warden dashboard. Phone 1: guard. Phone 2 (or a second browser window): student.
- On the warden dashboard, open **Settings** and press **Reset demo data**.
- Check that the curfew is later than the current time, so the first scan comes up green. You can change it in **Settings**.
- On the student phone, sign in as Fatima Al Mansoori, take a screenshot of her pass, then wait at least a minute before using it.
- Turn phone brightness up, turn on Do Not Disturb, and keep the guard phone's sound on.
- Record the laptop screen (OBS, or Win+Alt+R for the Xbox Game Bar). Record the phones with their screen recorder, and also film one real scan with another phone. A real phone scanning a real phone in a dim room is the most convincing shot we have.
- Record each scene separately and join them afterwards. Add short captions for the important moments, like "Screenshot rejected".

## Scene 1: The problem (0:00 to 0:20)

On screen: a hostel gate at night or a paper register, then the NightPass sign-in page.

> "Every night, wardens and security need to know one thing: is every student back? Right now that's a paper register at the gate. It's slow at curfew, it's easy to sign for a friend, it's hard to read at night, and nobody knows who's missing until someone counts the sheets."

## Scene 2: Our solution (0:20 to 0:35)

On screen: the sign-in page, moving over the three kinds of account.

> "NightPass replaces that with three simple screens. Students show a QR pass that changes every 15 seconds. Guards scan it with any phone. The warden sees who's back and who isn't, live."

## Scene 3: Working demo (0:35 to 1:50)

| Time | What to show | What to say |
| --- | --- | --- |
| 0:35 | Student phone: Aarav's pass, the code changing and the countdown bar | "This is Aarav's pass. The code changes every 15 seconds and only our server can create it." |
| 0:43 | Guard phone: tap Start scanning, point at Aarav's pass. Green "Checked in" with a beep | "The guard just points the phone and gets a full-screen answer in about a second, with the student's name, ID and room." |
| 0:50 | Aarav's phone now shows "You're checked in" | "Aarav's phone confirms it straight away." |
| 0:55 | Take the pass out of view for about 10 seconds (the scanner ignores a pass that stays in front of it), then scan again. Red "Already scanned" | "If he's scanned again, it's caught as a duplicate, even at a different gate." |
| 1:02 | Show the screenshot of Fatima's pass. Red "Expired code" | "Now a friend tries a screenshot of Fatima's pass. It's rejected, because screenshots expire within seconds. That's the end of signing in for a friend." |
| 1:14 | Guard phone: turn on airplane mode. Scan Fatima's live pass. Green, and the badge at the top shows "Offline · 1 queued" | "No signal at the gate? It still works, because the check happens on the phone…" |
| 1:24 | Turn airplane mode off. The top changes to "Online" and the scan gets a tick | "…and it uploads as soon as the network is back." |
| 1:28 | Manual entry, search "Rohan", pick "Phone battery dead", Mark present (amber) | "If a phone is dead, the guard searches the list, checks the ID card and marks them present. The warden gets it as something to review." |
| 1:36 | Laptop: dashboard numbers going up, the per-block bars | "The warden's dashboard updates on its own: who's in, who isn't, who was late, for each block." |
| 1:42 | **Not back yet** tab, with the highlighted rows that had a rejected scan | "This list is who to chase up, starting with anyone who had a scan rejected tonight." |
| 1:46 | **Needs review**: resolve one with a note. **Search & export**: Export CSV and open it in Excel | "Anything unusual gets reviewed with a note, and every report exports to Excel." |

## Scene 4: How it flows (1:50 to 2:15)

On screen: the flow diagram from the technical overview.

> "Here's the flow. The student's phone downloads twenty minutes of signed codes, so the pass works offline. The guard's phone downloads the student list and the university's public key, checks every scan itself, and queues it. The server checks everything again, so it can catch the same student at two gates at once, and the dashboard refreshes every few seconds."

## Scene 5: Technical choices (2:15 to 2:40)

On screen: the tech stack section of the README, then `npm test` passing.

> "Passes are signed with Ed25519. Scanners only have the public key, so they can check passes offline but can't make fake ones. Uploads are safe to repeat, and the database makes sure a student is only counted once a night. It's one Next.js app with Postgres, it runs on any phone, and every scan rule has a test."

## Scene 6: Impact (2:40 to 2:55)

On screen: the Expected impact section of the README.

> "A paper register takes 20 to 30 seconds per student. NightPass takes about two. For 150 students that's close to an hour of queueing down to a few minutes, with no hardware to buy, and signing for friends caught automatically. We'd like to start with a one-hostel trial. NightPass: know who's home."

## Tips

- Usability is 30% of the marks, so let the green and red screens and the sounds come through. Move slowly and keep the mouse still.
- Show a real phone scanning a real phone at least once, so it's obvious it isn't a mock-up.
- If there's time, get 3 to 5 friends to try the guard screen and time them. Then use the real average in Scene 6 ("2.1 seconds per student across five testers") instead of our estimate.
