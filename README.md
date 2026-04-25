# arbox-schedule

An automated class booking bot for [Arbox](https://www.arboxapp.com/) gym management software. It runs two cron jobs on a server: one that books your lessons every Friday evening for the following week, and another that polls every 10 minutes to auto-confirm standby spots before they expire.

---

## What it does

Arbox opens bookings for the following week every Friday. This bot handles the whole flow hands-free:

1. **Friday 21:00 (Israel time)** — the booking job runs. It fetches next week's schedule, finds your preferred classes by series ID (in priority order), and books up to 2 lessons. If a class is already full, it joins the standby list and persists the entry to local state.

2. **Every 10 minutes** — the standby job polls any open standby entries. When Arbox makes a slot available (via `availability_id`), the bot immediately confirms the booking and sends an email. If the class date has passed without confirmation, the entry is cleaned up.

3. **Email notifications via [Resend](https://resend.com)** — you get an email after every booking run, and individual alerts when a standby spot is confirmed, lost, or expires.

---

## Architecture

```
schedule/
  scheduler.ts    — entry point; registers both cron jobs
  booking.ts      — Friday booking logic
  standby.ts      — standby polling and auto-confirmation
  state.ts        — JSON-based state persistence (standby list)
  config.ts       — loads and validates env vars
  notify.ts       — email notifications via Resend
  utils.ts        — date helpers

api/
  client.ts       — Arbox HTTP client (reverse-engineered v2 API)

scripts/
  discover-ids.ts    — one-off helper: prints your BOX_ID, LOCATION_ID, MEMBERSHIP_ID
  trigger-booking.ts — manually trigger the booking job
  debug-schedule.ts  — dump next-week schedule and test a booking attempt

docs/
  api.md          — reverse-engineered Arbox API v2 reference
```

State is written to `state.json` in the working directory (overridable via `STATE_FILE` env var). The file tracks which classes you are on standby for — it is the only persistent runtime artifact.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable               | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `ARBOX_EMAIL`          | Your Arbox login email                                                         |
| `ARBOX_PASSWORD`       | Your Arbox password                                                            |
| `BOX_ID`               | Numeric ID of your gym (box)                                                   |
| `LOCATION_ID`          | Numeric ID of the gym location (`locations_box` ID)                            |
| `MEMBERSHIP_ID`        | Your active membership record ID (required to book)                            |
| `PRIMARY_SERIES_IDS`   | Comma-separated series IDs — booked first, in order (e.g. `76644881,76647404`) |
| `SECONDARY_SERIES_IDS` | Comma-separated fallback series IDs — used if primary slots are already full   |
| `RESEND_API_KEY`       | API key from [resend.com](https://resend.com)                                  |
| `NOTIFICATION_EMAIL`   | Email address to receive booking notifications                                 |
| `STATE_FILE`           | _(optional)_ Path to state JSON file; defaults to `./state.json`               |

### 3. Discover your IDs

If you don't know your `BOX_ID`, `LOCATION_ID`, or `MEMBERSHIP_ID`, run the discovery script with just your credentials set:

```bash
npx ts-node scripts/discover-ids.ts
```

It will log in, fetch your profile and recent schedule history, and print all three values.

**What is a series ID?** Each recurring class in Arbox belongs to a series (e.g. "HIIT, Sunday, 08:10"). Series IDs are stable across weeks — once you find them, they don't change. To find series IDs for the classes you want, run:

```bash
npx ts-node scripts/debug-schedule.ts
```

This prints the full next-week schedule with `series_fk` values alongside each class.

---

## Running

### Locally

```bash
npm start
```

This starts the scheduler process. It will run until killed. Two cron jobs are registered:

```
Booking job:  every Friday at 21:00 Israel time (0 21 * * 5)
Standby job:  every 10 minutes (*/10 * * * *)
```

### Manual booking trigger

To run the booking job immediately (useful for testing):

```bash
npx ts-node scripts/trigger-booking.ts
```

### Docker

```bash
docker build -t arbox-schedule .
docker run -d \
  --env-file .env \
  -v $(pwd)/state.json:/app/state.json \
  arbox-schedule
```

The container runs `ts-node schedule/scheduler.ts` on startup. The `STATE_FILE` env var can be used to mount state to a persistent volume at a known path.

---

## Deployment (Coolify)

The repo includes a `Dockerfile` ready for deployment on [Coolify](https://coolify.io/) or any Docker-compatible PaaS.

1. Push the repo to a Git provider connected to Coolify.
2. Create a new service — Coolify will detect the `Dockerfile`.
3. Set all required env vars in the Coolify environment panel.
4. Mount a persistent volume at `/app/state.json` so standby state survives restarts.

---

## How the booking logic works

The booking job runs on Friday and targets next week (Sunday through Saturday). It processes your series IDs in priority order: primary list first, then secondary. It books up to **2 lessons** per week.

For each candidate:

- Already booked or on standby → counts as a slot, skips
- Spot available (`free > 0`) → books immediately
- Class full (`free == 0`) → joins standby list, records the entry in `state.json`

> **Note on `has_spots`:** The Arbox API includes a `has_spots` field but it reflects membership eligibility, not raw availability. The bot uses `free > 0` instead.

---

## How standby confirmation works

When a booked user cancels, Arbox promotes the first standby user by setting `availability_id` on the schedule item and sending a push/email notification. The user has **~30 minutes** to confirm.

The standby job polls every 10 minutes. When it finds a non-null `availability_id` for a tracked entry, it immediately calls `scheduleUser/insert` with that ID to confirm the booking. If the `availability_id` has already expired, the error is logged and the entry is retried next cycle.

---

## Email notifications

Notifications are sent via [Resend](https://resend.com). During development, the `from` address uses `onboarding@resend.dev` which only delivers to your Resend-verified email. Once you have a verified sending domain, update the `from` field in [schedule/notify.ts](schedule/notify.ts).

| Event                        | Subject                                    |
| ---------------------------- | ------------------------------------------ |
| Friday booking run complete  | `Arbox booking — N of 2 lessons scheduled` |
| Standby spot confirmed       | `✅ Standby confirmed`                     |
| Standby position lost        | `❌ Standby slot lost`                     |
| Standby entry expired (past) | `ℹ️ Standby expired`                       |

---

## Development

```bash
npm run typecheck   # TypeScript type-check (no emit)
npm run lint        # ESLint
npm run format      # Prettier
npm test            # Vitest unit tests
```

Tests live in `tests/` and cover booking and standby logic against mock API responses.

---

## API reference

The bot talks to the unofficial Arbox v2 API at `https://apiappv2.arboxapp.com`. A full reverse-engineered reference is in [docs/api.md](docs/api.md), including auth flow, request/response shapes, error codes, and notes on non-obvious behavior (e.g. the `has_spots` / `free` distinction, standby confirmation flow).
