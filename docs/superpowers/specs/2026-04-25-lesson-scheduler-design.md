# Lesson Scheduler — Design Spec

## Context

The user attends 2 lessons per week at their Arbox gym. Manually booking each week is tedious and risks missing spots. This scheduler automates weekly booking every Saturday at midnight, targeting preferred class series in priority order, joining standby if full, and confirming standby slots as they open.

---

## Requirements

- Run every **Saturday at midnight** to book lessons for the following **Sunday–Saturday**
- Book **2 slots per week** using this priority order:
  1. `PRIMARY_SERIES_IDS` (env): e.g. `76644881`, `76647404`
  2. `SECONDARY_SERIES_IDS` (env): e.g. `76645656`, `76646335`
  - Walk the list, book the first 2 available, stop when 2 are filled
- If a target class is **full** → join standby, save to `state.json`
- **Every 10 minutes**: check standby classes for an open slot (`availability_id`), confirm immediately
- **Email notifications** (Resend) on: successful booking, standby entry, standby confirmation, any failure

---

## Architecture

Single-process Node.js TypeScript app with two `node-cron` jobs.

### Files

| File                    | Responsibility                        |
| ----------------------- | ------------------------------------- |
| `schedule/scheduler.ts` | Entry point; registers both cron jobs |
| `schedule/booking.ts`   | Saturday booking logic                |
| `schedule/standby.ts`   | 10-min standby confirmation logic     |
| `schedule/notify.ts`    | Resend email wrapper                  |
| `schedule/state.ts`     | Read/write `state.json`               |
| `state.json`            | Persisted standby list (gitignored)   |
| `.env`                  | Credentials and config (gitignored)   |
| `.env.example`          | Template                              |

### Reused from existing codebase

- `api/requests/auth.ts` — `login()`
- `api/requests/schedule.ts` — `getSchedule()`, `bookClass()`, `joinStandBy()`
- `api/client.ts` — HTTP client with auth headers
- `api/types/schedule.ts` — `ScheduleItem`, `BookClassRequest`, `StandByRequest`

---

## Environment Variables

```
ARBOX_EMAIL=              # Arbox login email
ARBOX_PASSWORD=           # Arbox login password
BOX_ID=                   # Discovered from API during setup
LOCATION_ID=              # Discovered from API during setup
MEMBERSHIP_ID=            # Discovered from API during setup
PRIMARY_SERIES_IDS=76644881,76647404
SECONDARY_SERIES_IDS=76645656,76646335
RESEND_API_KEY=           # User fills in
NOTIFICATION_EMAIL=       # User fills in
```

---

## Booking Algorithm (Saturday midnight)

```
1. Login → auth token
2. Compute next week's window: (Saturday + 1 day) 00:00 → (Saturday + 7 days) 23:59
3. getSchedule(token, { from, to, box_id, location_id })
4. Build priority list: [...PRIMARY_SERIES_IDS, ...SECONDARY_SERIES_IDS]
5. slots_filled = 0
6. For each seriesId in priority list (stop when slots_filled = 2):
   a. Find ScheduleItem where series_fk = seriesId
   b. If not found → skip (holiday/unavailable)
   c. If found and item.free > 0:
      - bookClass(token, { schedule_id: item.id, membership_user_id })
      - send "booked" email
      - slots_filled++
   d. If found and item.free = 0:
      - joinStandBy(token, { schedule_id: item.id, membership_user_id })
      - append to state.json: { scheduleId, seriesId, date }
      - send "standby" email
      - slots_filled++
7. If slots_filled < 2 → send "failure" email listing unfilled slots
8. Logout
```

---

## Standby Confirmation (every 10 minutes)

### state.json schema

```json
{
  "standby": [{ "scheduleId": 123, "seriesId": 76644881, "date": "2026-05-04" }]
}
```

### Polling logic

```
1. Load state.json — if standby[] is empty, exit early (no login needed)
2. Login → auth token
3. For each entry in standby[]:
   a. Re-fetch the schedule item by scheduleId
   b. If class date < today → remove from state (expired), send "expired" email
   c. If availability_id present in response:
      - bookClass(token, { schedule_id, membership_user_id, availability_id })
      - Success → remove from state, send "confirmed" email
      - Failure → leave in state, log error (retry next cycle)
   d. If user_in_standby = false AND user_booked = false:
      - Slot was lost (someone else got it and window closed)
      - Remove from state, send "standby lost" email
4. Save updated state.json
5. Logout
```

---

## Notifications (Resend)

| Event             | Subject              | Body                                 |
| ----------------- | -------------------- | ------------------------------------ |
| Booked            | ✅ Lesson booked     | Series ID, class date/time           |
| Standby entered   | ⏳ On standby        | Series ID, class date/time, position |
| Standby confirmed | ✅ Standby confirmed | Series ID, class date/time           |
| Standby lost      | ❌ Standby slot lost | Series ID, class date/time           |
| Booking failure   | ❌ Booking failed    | Which slots could not be filled      |

---

## Cron Schedules

| Job           | Cron expression | When                       |
| ------------- | --------------- | -------------------------- |
| Booking       | `0 0 * * 6`     | Every Saturday at midnight |
| Standby check | `*/10 * * * *`  | Every 10 minutes           |

---

## Verification

1. Run `npx ts-node schedule/scheduler.ts` — both cron jobs should register without errors
2. Manually trigger `runBookingJob()` from a test script — check `.env` creds, verify API calls succeed, check email received
3. Manually add a dummy entry to `state.json` and trigger `runStandbyJob()` — confirm it fetches the class and handles all state transitions
4. Check `state.json` is written/read correctly across restarts
