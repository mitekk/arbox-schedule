# Architecture & flows

`arbox-schedule` is an **event-driven modular monolith**: one Node process, one container, one
Neon Postgres database. A **gateway** is the sole HTTP ingress; **cron** is the sole scheduled
trigger; both only ever _emit_ a message onto a Postgres **transactional outbox**. A single
**dispatcher** polls that outbox and fans each message out to domain modules. Modules never call
each other and never write each other's tables — they coordinate exclusively through events.

Three invariants carry the design; every diagram below illustrates at least one:

- **Single writer per table** — each table has exactly one module allowed to write it. Cross-module
  change happens by emitting an event, never by a shared write.
- **Effect-lease before every Arbox side-effect** — the Arbox booking API is _non-idempotent_ and
  returns `200` even on no-ops, so a committed lease row (`arbox.effect_ledger`) is acquired
  **before** any `bookSlot`/`cancelBooking`. Lose the lease race ⇒ skip entirely, no Arbox call.
- **Ordering: lease (committed) → Arbox call (no tx) → result tx (state change + emit)** — the
  network call sits between two commits so a crash never both books _and_ forgets, or forgets _and_
  books.

---

## 1. System architecture (container view)

```mermaid
flowchart TB
  subgraph EXT["External services"]
    ARBOX["Arbox API"]
    RESEND["Resend email"]
  end

  subgraph CTR["ONE container · ONE Node process"]
    direction TB
    CRON["cron source<br/>Fri 21:00 · every 5 min"]
    GW["GATEWAY (node:http)<br/>/standby/run · /standby/sync<br/>/cancel · /healthz"]

    subgraph PLAT["platform (infra)"]
      OUTBOX[("platform.outbox")]
      DISP["DISPATCHER<br/>poll 10s · SKIP LOCKED<br/>reaper · backoff · dead-letter"]
    end

    BOOK["booking"]
    STBY["standby"]
    CANC["cancellation"]
    NOTIF["notification"]
    ARB["arbox<br/>session + client<br/>+ effect-lease gate"]
  end

  DB[("Neon Postgres<br/>schema per module<br/>ONE writer per table")]

  CRON -- emit --> OUTBOX
  GW -- "emit (run)" --> OUTBOX
  GW -- "inline (sync)" --> STBY
  GW -- "inline (cancel)" --> CANC
  OUTBOX --> DISP
  DISP -- "routes[name]" --> BOOK
  DISP --> STBY
  DISP --> CANC
  DISP --> NOTIF
  BOOK -- "lease + book" --> ARB
  STBY -- "lease + confirm" --> ARB
  CANC -- "lease + cancel" --> ARB
  ARB -- "only caller" --> ARBOX
  NOTIF -- "only caller" --> RESEND
  ARB -- pg --> DB
  BOOK -- pg --> DB
  STBY -- pg --> DB
  NOTIF -- pg --> DB
  DISP -- pg --> DB
```

> Boot order (`src/main.ts`): `loadConfig → createPool → runMigrations → runStartupCatchup →
dispatcher.start → startCron → startServer`. The `arbox` module is the **only** caller of the
> Arbox API; `notification` is the **only** caller of Resend. Cancel and sync run **inline** (a
> human blocks on the HTTP response); all cron work is async and durable via the outbox.

---

## 2. Single-writer-per-table matrix

Exactly one module may write each table. This is the structural enforcement of module isolation —
violating it is a design bug, not a style preference.

| Schema         | Table               | Sole writer                                     | Purpose                                   |
| -------------- | ------------------- | ----------------------------------------------- | ----------------------------------------- |
| `platform`     | `outbox`            | `emit()` appends · **dispatcher** delivery cols | durable command/event queue               |
| `platform`     | `consumed`          | dispatcher                                      | `(message_id, consumer)` processed-once   |
| `platform`     | `schema_migrations` | `migrate.ts`                                    | applied migrations                        |
| `arbox`        | `effect_ledger`     | **arbox**                                       | the idempotency gate (effect-lease)       |
| `booking`      | `booking_run`       | **booking**                                     | one row per Friday run (`week_of` UNIQUE) |
| `booking`      | `booked_lesson`     | **booking**                                     | per-slot audit                            |
| `standby`      | `watch_entry`       | **standby**                                     | durable watchlist (replaces state.json)   |
| `notification` | `sent_email`        | **notification**                                | email dedupe by `dedupe_key`              |

> The outbox is not an exception to the rule: domain modules only _append_ via `emit(tx, msg)`; the
> single dispatcher owns the delivery columns (`status`, `attempts`, `locked_at`, …). When booking
> joins a waitlist it emits `StandbyJoined`; **standby** — not booking — writes the `watch_entry`.

---

## 3. Event catalog

Commands (directed, one consumer) and events (facts, 0..N consumers) ride the same outbox,
discriminated by `kind`. Adding a consumer is one push into `routes[name]`.

```mermaid
flowchart LR
  CRON["cron / catch-up"]
  GWRUN["gateway /standby/run"]

  subgraph CMD["commands"]
    BR["BookingRequested"]
    STR["StandbyTickRequested"]
  end

  subgraph EVT["events (facts)"]
    LB["LessonBooked"]
    SJ["StandbyJoined"]
    BSC["BookingSessionCompleted"]
    SC["StandbyConfirmed"]
    SL["StandbyLost"]
    SE["StandbyExpired"]
    BC["BookingCancelled"]
    OF["OperationFailed"]
  end

  CRON --> BR
  CRON --> STR
  GWRUN --> STR

  BR --> BOOK["booking"]
  STR --> STBY["standby"]

  BOOK --> SJ
  BOOK --> LB
  BOOK --> BSC
  STBY --> SC
  STBY --> SL
  STBY --> SE
  CANC["cancellation"] --> BC
  DISP["dispatcher (dead-letter)"] --> OF

  SJ -- "watch row" --> STBY
  BSC --> NOTIF["notification → email"]
  SC --> NOTIF
  SL --> NOTIF
  SE --> NOTIF
  OF --> NOTIF
```

> `OperationFailed` is emitted by the dispatcher when a message exhausts its retries — it turns a
> silent dead-letter into a manual-action email instead of a swallowed `console.error`.

---

## 4. Dispatcher / outbox lifecycle (one tick, every 10s)

```mermaid
flowchart TB
  START(["tick (every 10s)"]) --> REAP["reapStuck:<br/>re-queue 'processing' rows<br/>with locked_at < now-5min"]
  REAP --> CLAIM["claimBatch (LIMIT 10)<br/>FOR UPDATE SKIP LOCKED<br/>ORDER BY id"]
  CLAIM --> LOOP{"for each row"}
  LOOP -->|consumer in routes| CONS{"isConsumed(message_id, consumer)?"}
  CONS -->|yes| SKIP["skip consumer"]
  CONS -->|no| HANDLE["handle(msg)"]
  HANDLE --> REC["recordConsumed"]
  REC --> NEXTC{"more consumers?"}
  SKIP --> NEXTC
  NEXTC -->|yes| CONS
  NEXTC -->|no| DONE["markDone"]
  HANDLE -->|throws| ERR{"attempts + 1 >= 8?"}
  ERR -->|no| FAIL["markFailed<br/>next_attempt = now + min(2^n, 300)s"]
  ERR -->|yes| DEAD["markDead<br/>+ emit OperationFailed"]
  DEAD --> EMAIL["notification → manual-action email"]
```

> `consumed` is a delivery-dedup _optimization_; the real guard against a re-run causing a
> double-effect is the per-module idempotency (the effect-lease for Arbox calls, `sent_email` for
> emails). Poll-only (no `LISTEN/NOTIFY`) is deliberate: Neon's PgBouncer transaction pooling can't
> hold a session listener, and one user doesn't need sub-second latency.

---

## 5. Friday booking flow

Fires at **Fri 21:00 Asia/Jerusalem** (or on startup catch-up if a redeploy crossed that window).
Walks PRIMARY → SECONDARY series, stops at 2 lessons; each slot is independently lease-gated.

```mermaid
sequenceDiagram
  participant Cron
  participant Outbox as platform.outbox
  participant Disp as Dispatcher
  participant Book as booking
  participant Arb as arbox (lease)
  participant API as Arbox API
  participant Stby as standby
  participant Notif as notification

  Cron->>Outbox: emit BookingRequested(weekOf)
  Disp->>Book: deliver
  Book->>Arb: getWeekSchedule(weekOf..+6)
  Note over Book: decide() → up to 2 intents (book | standby-join)
  loop each intent
    Book->>Arb: acquireLease(book|standby-join, scheduleId, date, key=weekOf)
    alt lease acquired
      Book->>API: bookSlot / joinStandby
      Note over Book,Outbox: tx { completeLease + recordLesson + emit LessonBooked|StandbyJoined }
    else lease held / call throws
      Note over Book: skip (releaseLease on error → retriable)
    end
  end
  Book->>Outbox: emit BookingSessionCompleted(outcomes)
  Outbox->>Stby: deliver StandbyJoined → write watch_entry
  Outbox->>Notif: deliver BookingSessionCompleted → summary email
```

> `booking_run.week_of` is UNIQUE and `attempt_key = weekOf`, so a duplicated `BookingRequested`
> (cron + catch-up racing) re-acquires nothing and books nothing twice.

---

## 6. Standby confirm flow — the money path

Every 5 minutes the tick checks each watched entry; when Arbox frees a slot it auto-confirms. This
is where a double-confirm would actually cost money, so it is the most heavily guarded path.

```mermaid
sequenceDiagram
  participant Cron
  participant Outbox as platform.outbox
  participant Disp as Dispatcher
  participant Stby as standby
  participant Arb as arbox (lease)
  participant API as Arbox API
  participant Notif as notification

  Cron->>Outbox: emit StandbyTickRequested
  Disp->>Stby: deliver
  Note over Stby: pg_try_advisory_xact_lock('standby-tick')<br/>not acquired ⇒ return (another tick runs)
  Stby->>Arb: getDaySchedule(date) per watched entry
  Note over Stby: classify → confirm? (availability_id present)
  Stby->>Arb: acquireLease(confirm, scheduleId, date)
  alt lease acquired (winner)
    Arb->>API: bookSlot(availabilityId)
    Note over Stby,Outbox: completeLease, then tx { status=confirmed + emit StandbyConfirmed }
    Outbox->>Notif: StandbyConfirmed → email (with cancel link)
  else lease already held (redelivery / concurrent tick / double-click)
    Note over Stby: skip — NO Arbox call, no double-book
  end
```

> Two layers serialize this: the **advisory lock** stops two overlapping ticks from both scanning,
> and the **effect-lease** stops any second path (redelivery, manual `/standby/run`) from issuing a
> second `bookSlot`. `lost`/`expired` decisions emit their own events and never touch the lease.

---

## 7. One-click cancel flow

The booking confirmation email carries an HMAC-signed `GET /cancel` link. It runs **inline** —
the clicking human blocks on the response — and is lease-gated so a double-click is a no-op `200`.

```mermaid
sequenceDiagram
  participant User
  participant GW as gateway /cancel
  participant Canc as cancellation
  participant Arb as arbox (lease)
  participant API as Arbox API
  participant Outbox as platform.outbox

  User->>GW: GET /cancel?token=...
  GW->>Canc: handleCancel(token)
  Canc->>Canc: verifyCancelToken (HMAC) — bad ⇒ 400
  Canc->>Arb: getDaySchedule(date)
  Note over Canc: not booked ⇒ 404
  Canc->>Arb: acquireLease(cancel, scheduleId, date, key=user_booked)
  alt lease acquired
    Canc->>API: cancelBooking(scheduleId, user_booked)
    Note over Canc,Outbox: completeLease + emit BookingCancelled
    Canc-->>User: 200 "Booking cancelled successfully"
  else lease already held (double-click / in-flight)
    Canc-->>User: 200 (no-op, no second Arbox call)
  end
```

> `attempt_key = user_booked` (the booking instance id) means a double-click on the same link is an
> idempotent no-op, yet a later _re-book_ of the same slot gets a fresh booking instance and can be
> cancelled again.
