# Lesson Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js scheduler that automatically books 2 Arbox gym lessons per week, handles standby lists, and sends Resend email notifications for all outcomes.

**Architecture:** Two `node-cron` jobs in a single long-running process — one fires every Saturday midnight to book next week's lessons in priority order, another fires every 10 minutes to confirm any standby slots that open. Persists standby state to `state.json` so the process can be restarted safely.

**Tech Stack:** TypeScript, node-cron, resend, ts-node, dotenv (already installed)

---

## File Map

| Action | Path                      | Responsibility                                                  |
| ------ | ------------------------- | --------------------------------------------------------------- |
| Create | `schedule/config.ts`      | Config interface + loadConfig() from env                        |
| Create | `schedule/state.ts`       | state.json read/write, StandbyEntry type                        |
| Create | `schedule/notify.ts`      | Resend email wrapper, createNotifier()                          |
| Create | `schedule/booking.ts`     | Saturday booking job logic                                      |
| Create | `schedule/standby.ts`     | 10-min standby confirmation logic                               |
| Create | `schedule/scheduler.ts`   | Entry point: cron job registration                              |
| Create | `scripts/discover-ids.ts` | One-time helper: prints BOX_ID, LOCATION_ID, MEMBERSHIP_ID      |
| Modify | `api/types/schedule.ts`   | Add `availability_id` to ScheduleItem + BookClassRequest        |
| Modify | `tsconfig.json`           | Add schedule/**/\* and scripts/**/\* to include                 |
| Modify | `package.json`            | Add dependencies + start script                                 |
| Modify | `.env`                    | Fill in all values except RESEND_API_KEY and NOTIFICATION_EMAIL |
| Create | `.env.example`            | Template with all keys, values blank                            |

---

## Task 0: Install Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install node-cron resend
```

Expected: `node-cron` and `resend` added to `dependencies` in `package.json`.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D @types/node-cron ts-node
```

Expected: added to `devDependencies`.

- [ ] **Step 3: Add start script and update tsconfig include**

In `package.json`, add to `"scripts"`:

```json
"start": "ts-node schedule/scheduler.ts"
```

In `tsconfig.json`, replace `"include"`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022", "dom"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["api/**/*", "schedule/**/*", "scripts/**/*"]
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors (no new files yet, just config change).

- [ ] **Step 5: Create .env.example**

Create `.env.example`:

```
ARBOX_EMAIL=
ARBOX_PASSWORD=
BOX_ID=
LOCATION_ID=
MEMBERSHIP_ID=
PRIMARY_SERIES_IDS=76644881,76647404
SECONDARY_SERIES_IDS=76645656,76646335
RESEND_API_KEY=
NOTIFICATION_EMAIL=
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example
git commit -m "chore: add node-cron, resend, ts-node; update tsconfig include"
```

---

## Task 1: Discover and Fill BOX_ID, LOCATION_ID, MEMBERSHIP_ID

**Files:** `scripts/discover-ids.ts`, `.env`

- [ ] **Step 1: Create the discovery script**

Create `scripts/discover-ids.ts`:

```typescript
import "dotenv/config";
import { login } from "../api/requests/auth";
import { getProfile } from "../api/requests/user";

async function main() {
  const email = process.env.ARBOX_EMAIL;
  const password = process.env.ARBOX_PASSWORD;
  if (!email || !password)
    throw new Error("ARBOX_EMAIL and ARBOX_PASSWORD must be set in .env");

  const {
    data: { token },
  } = await login({ email, password });
  const { data: profile } = await getProfile(token);

  console.log("\nActive box memberships:\n");
  for (const ub of profile.users_boxes) {
    if (ub.active) {
      console.log(`Box: ${ub.box.name}`);
      console.log(`  BOX_ID=${ub.box_fk}`);
      console.log(`  LOCATION_ID=${ub.locations_box_fk}`);
      console.log(`  MEMBERSHIP_ID=${ub.ub_id}`);
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

```bash
npx ts-node scripts/discover-ids.ts
```

Expected output (example):

```
Active box memberships:

Box: My Gym
  BOX_ID=12345
  LOCATION_ID=67890
  MEMBERSHIP_ID=11111
```

- [ ] **Step 3: Fill .env with discovered values**

Add to `.env` (keep existing ARBOX_EMAIL and ARBOX_PASSWORD):

```
BOX_ID=<value from output>
LOCATION_ID=<value from output>
MEMBERSHIP_ID=<value from output>
PRIMARY_SERIES_IDS=76644881,76647404
SECONDARY_SERIES_IDS=76645656,76646335
RESEND_API_KEY=
NOTIFICATION_EMAIL=
```

- [ ] **Step 4: Commit**

```bash
git add scripts/discover-ids.ts
git commit -m "chore: add discover-ids setup script"
```

---

## Task 2: Extend API Types for Standby Confirmation

**Files:** `api/types/schedule.ts`

The `availability_id` field appears on a `ScheduleItem` when a standby slot opens for the authenticated user. It must also be an optional field on `BookClassRequest` for standby confirmation calls.

- [ ] **Step 1: Add availability_id to ScheduleItem**

In `api/types/schedule.ts`, find the `ScheduleItem` interface. After the `booking_option` field, add:

```typescript
availability_id: number | null;
```

- [ ] **Step 2: Add availability_id to BookClassRequest**

In `api/types/schedule.ts`, update `BookClassRequest`:

```typescript
export interface BookClassRequest {
  schedule_id: number;
  membership_user_id: number;
  availability_id?: number;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/types/schedule.ts
git commit -m "feat: add availability_id to ScheduleItem and BookClassRequest"
```

---

## Task 3: schedule/config.ts

**Files:** `schedule/config.ts`

- [ ] **Step 1: Create config.ts**

Create `schedule/config.ts`:

```typescript
export interface Config {
  email: string;
  password: string;
  boxId: number;
  locationId: number;
  membershipId: number;
  primarySeriesIds: number[];
  secondarySeriesIds: number[];
  resendApiKey: string;
  notificationEmail: string;
}

export function loadConfig(): Config {
  const required = [
    "ARBOX_EMAIL",
    "ARBOX_PASSWORD",
    "BOX_ID",
    "LOCATION_ID",
    "MEMBERSHIP_ID",
    "PRIMARY_SERIES_IDS",
    "SECONDARY_SERIES_IDS",
    "RESEND_API_KEY",
    "NOTIFICATION_EMAIL",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  return {
    email: process.env.ARBOX_EMAIL!,
    password: process.env.ARBOX_PASSWORD!,
    boxId: parseInt(process.env.BOX_ID!, 10),
    locationId: parseInt(process.env.LOCATION_ID!, 10),
    membershipId: parseInt(process.env.MEMBERSHIP_ID!, 10),
    primarySeriesIds: process.env.PRIMARY_SERIES_IDS!.split(",").map(Number),
    secondarySeriesIds: process.env
      .SECONDARY_SERIES_IDS!.split(",")
      .map(Number),
    resendApiKey: process.env.RESEND_API_KEY!,
    notificationEmail: process.env.NOTIFICATION_EMAIL!,
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add schedule/config.ts
git commit -m "feat: add config loader with env validation"
```

---

## Task 4: schedule/state.ts

**Files:** `schedule/state.ts`

- [ ] **Step 1: Create state.ts**

Create `schedule/state.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface StandbyEntry {
  scheduleId: number;
  seriesId: number;
  date: string; // YYYY-MM-DD
}

export interface AppState {
  standby: StandbyEntry[];
}

const STATE_PATH = resolve(process.cwd(), "state.json");

export function loadState(): AppState {
  if (!existsSync(STATE_PATH)) return { standby: [] };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as AppState;
  } catch {
    return { standby: [] };
  }
}

export function saveState(state: AppState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function addStandbyEntry(entry: StandbyEntry): void {
  const state = loadState();
  if (!state.standby.find((e) => e.scheduleId === entry.scheduleId)) {
    state.standby.push(entry);
    saveState(state);
  }
}

export function removeStandbyEntry(state: AppState, scheduleId: number): void {
  state.standby = state.standby.filter((e) => e.scheduleId !== scheduleId);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add schedule/state.ts
git commit -m "feat: add state.json persistence for standby entries"
```

---

## Task 5: schedule/notify.ts

**Files:** `schedule/notify.ts`

- [ ] **Step 1: Create notify.ts**

Create `schedule/notify.ts`:

```typescript
import { Resend } from "resend";
import type { StandbyEntry } from "./state";

export interface BookedInfo {
  seriesId: number;
  date: string;
  time: string;
}

export interface StandbyInfo {
  seriesId: number;
  date: string;
  time: string;
  position: number;
}

export interface FailureInfo {
  slotsFilled: number;
  unfilled: number[];
}

export interface Notifier {
  sendBookedEmail: (info: BookedInfo) => Promise<void>;
  sendStandbyEmail: (info: StandbyInfo) => Promise<void>;
  sendConfirmedEmail: (entry: StandbyEntry) => Promise<void>;
  sendStandbyLostEmail: (entry: StandbyEntry) => Promise<void>;
  sendExpiredEmail: (entry: StandbyEntry) => Promise<void>;
  sendFailureEmail: (info: FailureInfo) => Promise<void>;
}

export function createNotifier(apiKey: string, toEmail: string): Notifier {
  const resend = new Resend(apiKey);

  async function send(subject: string, text: string): Promise<void> {
    await resend.emails.send({
      // onboarding@resend.dev works for Resend test mode (sends to verified account email only).
      // Replace with your own domain sender once verified in Resend dashboard.
      from: "Arbox Scheduler <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text,
    });
  }

  return {
    sendBookedEmail: (info) =>
      send(
        "✅ Lesson booked",
        `Booked class for series ${info.seriesId} on ${info.date} at ${info.time}.`
      ),
    sendStandbyEmail: (info) =>
      send(
        "⏳ On standby",
        `Joined standby for series ${info.seriesId} on ${info.date} at ${info.time} (position ${info.position}).`
      ),
    sendConfirmedEmail: (entry) =>
      send(
        "✅ Standby confirmed",
        `Confirmed standby spot for series ${entry.seriesId} on ${entry.date}.`
      ),
    sendStandbyLostEmail: (entry) =>
      send(
        "❌ Standby slot lost",
        `Lost standby position for series ${entry.seriesId} on ${entry.date}. No action needed.`
      ),
    sendExpiredEmail: (entry) =>
      send(
        "ℹ️ Standby expired",
        `Standby entry for series ${entry.seriesId} on ${entry.date} has passed without confirmation.`
      ),
    sendFailureEmail: (info) =>
      send(
        "❌ Booking incomplete",
        `Only ${info.slotsFilled}/2 slots could be filled this week.\nNo class found for series: ${info.unfilled.join(", ")}.`
      ),
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add schedule/notify.ts
git commit -m "feat: add Resend email notifier"
```

---

## Task 6: schedule/booking.ts

**Files:** `schedule/booking.ts`

- [ ] **Step 1: Create booking.ts**

Create `schedule/booking.ts`:

```typescript
import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass, joinStandBy } from "../api/requests/schedule";
import { addStandbyEntry } from "./state";
import type { Config } from "./config";
import type { Notifier } from "./notify";

export async function runBookingJob(
  config: Config,
  notifier: Notifier
): Promise<void> {
  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });

  try {
    // Window: next Sunday (day after today=Saturday) through following Saturday
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + 1);
    nextSunday.setHours(0, 0, 0, 0);

    const nextSaturday = new Date(nextSunday);
    nextSaturday.setDate(nextSunday.getDate() + 6);
    nextSaturday.setHours(23, 59, 59, 0);

    const from = nextSunday.toISOString().split("T")[0];
    const to = nextSaturday.toISOString().split("T")[0];

    const { data: items } = await getSchedule(token, {
      from,
      to,
      locations_box_id: config.locationId,
      boxes_id: config.boxId,
    });

    const priorityList = [
      ...config.primarySeriesIds,
      ...config.secondarySeriesIds,
    ];
    let slotsFilled = 0;
    const unfilled: number[] = [];

    for (const seriesId of priorityList) {
      if (slotsFilled >= 2) break;

      const item = items.find((i) => i.series_fk === seriesId);
      if (!item) {
        unfilled.push(seriesId);
        continue;
      }

      if (item.free > 0) {
        await bookClass(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        await notifier.sendBookedEmail({
          seriesId,
          date: item.date,
          time: item.time,
        });
        console.log(
          `[booking] Booked series ${seriesId} on ${item.date} at ${item.time}`
        );
      } else {
        await joinStandBy(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        addStandbyEntry({ scheduleId: item.id, seriesId, date: item.date });
        await notifier.sendStandbyEmail({
          seriesId,
          date: item.date,
          time: item.time,
          position: item.stand_by + 1,
        });
        console.log(
          `[booking] Joined standby for series ${seriesId} on ${item.date} (position ${item.stand_by + 1})`
        );
      }

      slotsFilled++;
    }

    if (slotsFilled < 2) {
      await notifier.sendFailureEmail({ slotsFilled, unfilled });
      console.log(
        `[booking] Only ${slotsFilled}/2 slots filled. Unfilled series: ${unfilled.join(", ")}`
      );
    }
  } finally {
    await logout(token);
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add schedule/booking.ts
git commit -m "feat: implement weekly booking job"
```

---

## Task 7: schedule/standby.ts

**Files:** `schedule/standby.ts`

- [ ] **Step 1: Create standby.ts**

Create `schedule/standby.ts`:

```typescript
import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass } from "../api/requests/schedule";
import { loadState, saveState, removeStandbyEntry } from "./state";
import type { Config } from "./config";
import type { Notifier } from "./notify";

export async function runStandbyJob(
  config: Config,
  notifier: Notifier
): Promise<void> {
  const state = loadState();
  if (state.standby.length === 0) return;

  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });

  try {
    const today = new Date().toISOString().split("T")[0];
    let stateChanged = false;

    for (const entry of [...state.standby]) {
      // Class has passed — clean up
      if (entry.date < today) {
        removeStandbyEntry(state, entry.scheduleId);
        stateChanged = true;
        await notifier.sendExpiredEmail(entry);
        console.log(
          `[standby] Expired entry for series ${entry.seriesId} on ${entry.date}`
        );
        continue;
      }

      // Re-fetch class state for this specific day
      const { data: items } = await getSchedule(token, {
        from: entry.date,
        to: entry.date,
        locations_box_id: config.locationId,
        boxes_id: config.boxId,
      });

      const item = items.find((i) => i.id === entry.scheduleId);
      if (!item) continue;

      // A standby slot opened for this user
      if (item.availability_id != null) {
        try {
          await bookClass(token, {
            schedule_id: item.id,
            membership_user_id: config.membershipId,
            availability_id: item.availability_id,
          });
          removeStandbyEntry(state, entry.scheduleId);
          stateChanged = true;
          await notifier.sendConfirmedEmail(entry);
          console.log(
            `[standby] Confirmed standby for series ${entry.seriesId} on ${entry.date}`
          );
        } catch (err) {
          // availability_id may have expired — leave in state for next cycle
          console.error(
            `[standby] Failed to confirm series ${entry.seriesId}, retrying next cycle:`,
            err
          );
        }
        continue;
      }

      // No longer on standby and not booked — slot was lost
      if (item.user_in_standby == null && item.user_booked == null) {
        removeStandbyEntry(state, entry.scheduleId);
        stateChanged = true;
        await notifier.sendStandbyLostEmail(entry);
        console.log(
          `[standby] Lost standby for series ${entry.seriesId} on ${entry.date}`
        );
      }
    }

    if (stateChanged) saveState(state);
  } finally {
    await logout(token);
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add schedule/standby.ts
git commit -m "feat: implement standby confirmation polling"
```

---

## Task 8: schedule/scheduler.ts (Entry Point)

**Files:** `schedule/scheduler.ts`

- [ ] **Step 1: Create scheduler.ts**

Create `schedule/scheduler.ts`:

```typescript
import "dotenv/config";
import * as cron from "node-cron";
import { loadConfig } from "./config";
import { createNotifier } from "./notify";
import { runBookingJob } from "./booking";
import { runStandbyJob } from "./standby";

const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);

// Every Saturday at midnight — book next week's lessons
cron.schedule("0 0 * * 6", () => {
  console.log("[booking] Cron triggered");
  runBookingJob(config, notifier).catch((err) =>
    console.error("[booking] Unhandled error:", err)
  );
});

// Every 10 minutes — confirm any open standby slots
cron.schedule("*/10 * * * *", () => {
  runStandbyJob(config, notifier).catch((err) =>
    console.error("[standby] Unhandled error:", err)
  );
});

console.log("Scheduler started.");
console.log("  Booking job:  every Saturday at midnight (0 0 * * 6)");
console.log("  Standby job:  every 10 minutes (*/10 * * * *)");
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Start the scheduler and verify both crons register**

```bash
npm start
```

Expected output:

```
Scheduler started.
  Booking job:  every Saturday at midnight (0 0 * * 6)
  Standby job:  every 10 minutes (*/10 * * * *)
```

The process stays running (does not exit). Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add schedule/scheduler.ts
git commit -m "feat: add scheduler entry point with cron jobs"
```

---

## Task 9: Manual End-to-End Verification

- [ ] **Step 1: Test the booking job manually**

Create a temporary file `scripts/trigger-booking.ts` (delete after testing):

```typescript
import "dotenv/config";
import { loadConfig } from "../schedule/config";
import { createNotifier } from "../schedule/notify";
import { runBookingJob } from "../schedule/booking";

const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);
runBookingJob(config, notifier)
  .then(() => console.log("Done"))
  .catch(console.error);
```

Run:

```bash
npx ts-node scripts/trigger-booking.ts
```

Expected: logs showing each series checked, bookings or standby entries made, email received at NOTIFICATION_EMAIL. Check `state.json` if any classes were full.

- [ ] **Step 2: Test the standby job manually**

If `state.json` has entries from Step 1, run:

```bash
npx ts-node -e "
import 'dotenv/config';
const { loadConfig } = require('./schedule/config');
const { createNotifier } = require('./schedule/notify');
const { runStandbyJob } = require('./schedule/standby');
const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);
runStandbyJob(config, notifier).then(() => console.log('Done')).catch(console.error);
"
```

Or create `scripts/trigger-standby.ts` similarly to Step 1.

Expected: logs per standby entry, appropriate emails for expired/confirmed/lost states.

- [ ] **Step 3: Verify state.json persists across restarts**

```bash
echo '{"standby":[{"scheduleId":999,"seriesId":76644881,"date":"2099-01-01"}]}' > state.json
npm start
# wait for first 10-min cron tick (or lower the cron to */1 * * * * temporarily)
# check logs for [standby] output
```

- [ ] **Step 4: Add state.json and trigger scripts to .gitignore**

Append to `.gitignore` (create it if it doesn't exist):

```
state.json
scripts/trigger-*.ts
```

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: gitignore state.json and trigger scripts"
```
