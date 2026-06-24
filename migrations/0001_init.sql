-- 0001_init: platform outbox/consumed transport + arbox effect-lease gate.
-- (platform.schema_migrations is created by the migration runner itself.)

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.outbox (
  id              bigserial PRIMARY KEY,          -- ordering
  message_id      uuid NOT NULL UNIQUE,           -- idempotency / dedupe key
  kind            text NOT NULL,                  -- 'command' | 'event'
  name            text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending',-- pending|processing|done|failed|dead
  attempts        int  NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_ready ON platform.outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX outbox_stuck ON platform.outbox (locked_at)
  WHERE status = 'processing';

CREATE TABLE platform.consumed (
  message_id  uuid NOT NULL,
  consumer    text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, consumer)
);

CREATE SCHEMA IF NOT EXISTS arbox;

-- The idempotency gate: a lease is acquired here (committed) BEFORE any
-- non-idempotent Arbox booking/cancel call. One row per logical effect.
CREATE TABLE arbox.effect_ledger (
  id          bigserial PRIMARY KEY,
  effect_type text NOT NULL,                      -- 'book' | 'confirm' | 'standby-join' | 'cancel'
  schedule_id bigint NOT NULL,
  for_date    date   NOT NULL,
  attempt_key text   NOT NULL DEFAULT '',         -- allows a legitimate cancel->rebook
  status      text   NOT NULL DEFAULT 'in_progress', -- in_progress|done|failed
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (effect_type, schedule_id, for_date, attempt_key)
);
