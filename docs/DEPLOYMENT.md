# Deployment guide

NightPass is a normal Next.js app with a Postgres database. Pick whichever option suits you.

| Option | Cost | Data | Good for |
| --- | --- | --- | --- |
| [Vercel + Neon](#option-1-vercel--neon) | Free tiers | Permanent Postgres | A public demo link |
| [Any Node host](#option-2-any-node-host) | Free tier or a small server | Postgres, or the built-in database | A campus server |
| [Docker](#option-3-docker) | Your own server | Postgres, or the built-in database on a volume | The university's data centre |

## Environment variables

| Variable | Needed? | What it's for |
| --- | --- | --- |
| `DATABASE_URL` | Recommended when deployed | Postgres connection string. If it's not set, the built-in PGlite database is used (stored in `./.data`, or `/tmp` on Vercel). |
| `QR_SIGNING_KEY` | Yes, when deployed | The private key that signs student passes (64 hex characters). |
| `AUTH_SECRET` | Yes, when deployed | Secret used to sign login cookies. |
| `DEMO_MODE` | No, defaults to `true` | Turns on the demo accounts and the "Reset demo data" button. Set it to `false` for real use. |

To generate the two keys:

```bash
npm run keys
```

Keep `QR_SIGNING_KEY` the same once you've set it. If it changes, the passes already on students' phones stop working until they refresh (which happens by itself within a minute if they're online).

The tables are created automatically on the first start, and demo data is added if there are no students yet. There's no separate migration step.

## Option 1: Vercel + Neon

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository. Vercel detects Next.js, so you don't need to change any build settings.
3. In the new project, open **Storage**, choose **Create Database**, then **Neon (Serverless Postgres)** on the free plan, and connect it to the project. This adds `DATABASE_URL` for you.
4. In **Settings > Environment Variables**, add `QR_SIGNING_KEY` and `AUTH_SECRET` (from `npm run keys`), and `DEMO_MODE` set to `true` for the hackathon.
5. Open **Deployments** and redeploy. The first visit creates the tables and loads the demo data, which takes a couple of seconds.

The site runs on https, so the phone camera works straight away.

If you skip the database, Vercel falls back to the built-in database in `/tmp`. That's fine for a quick look, but each server instance gets its own copy, so the scanner and the dashboard might not agree. Add Neon before recording a demo.

## Option 2: Any Node host

Build command: `npm ci && npm run build`. Start command: `npm start`. Node 20.9 or newer.

- **Render** (free web service): create a new Web Service from the repo, use the build and start commands above, and add the environment variables. For data that survives restarts, set `DATABASE_URL` (a free Neon database works). Without it, the built-in database is reset when the service restarts. That's acceptable for a demo, since the demo data is recreated automatically.
- **A campus server:** run `npm ci && npm run build && npm start` behind nginx with https. The built-in database lives in `./.data`, or you can point `DATABASE_URL` at the university's Postgres.

## Option 3: Docker

```bash
docker build -t nightpass .
docker run -p 3000:3000 \
  -e QR_SIGNING_KEY=your-key -e AUTH_SECRET=your-secret \
  -v nightpass-data:/app/.data \
  nightpass
```

Add `-e DATABASE_URL=postgres://...` to use an external Postgres. Put it behind an https reverse proxy so phones can use the camera.

## Testing on a phone during development

Phone browsers only allow the camera on https pages (or on `localhost`, which doesn't help for a phone). With the app running on your laptop, you have two choices.

**1. An https tunnel (easiest, no account needed)**

```bash
npm run dev
```

In a second terminal:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Open the `https://....trycloudflare.com` address it prints on your phone. Sign in as the guard on the phone and as a student on the laptop or a second phone.

**2. Same Wi-Fi, without the camera.** Open `http://<your-laptop-ip>:3000` on the phone (the "Network" address shown when `npm run dev` starts). Everything works except the camera, so use **Manual entry** or a USB/Bluetooth barcode scanner.

## Before using it for real

- [ ] Set `DEMO_MODE=false` and switch sign-in to university Google accounts (see the [technical overview](TECHNICAL.md#moving-from-prototype-to-production))
- [ ] Set `QR_SIGNING_KEY` and `AUTH_SECRET` as secrets
- [ ] Point `DATABASE_URL` at a managed Postgres with backups
- [ ] Import the real student list (warden dashboard, **Students** tab, **Import CSV**)
- [ ] Rename the gates and staff to match the campus (`checkpoints` and `staff` tables)
- [ ] Serve everything over https
