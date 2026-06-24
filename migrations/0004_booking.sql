-- 0004_booking: the booking module's run + per-slot audit. Owned by booking.

CREATE SCHEMA IF NOT EXISTS booking;

CREATE TABLE booking.booking_run (
  id           bigserial PRIMARY KEY,
  week_of      date NOT NULL UNIQUE,    -- Sunday of the booked week; X3 catch-up key
  started_at   timestamptz NOT NULL DEFAULT now(),
  slots_filled int NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'completed'
);

-- No unique(schedule_id): the effect-lease is the gate; a bare unique would
-- poison-loop. This is an append-only audit of what each run did.
CREATE TABLE booking.booked_lesson (
  id          bigserial PRIMARY KEY,
  run_id      bigint NOT NULL REFERENCES booking.booking_run(id),
  schedule_id bigint NOT NULL,
  series_id   bigint NOT NULL,
  date        date NOT NULL,
  class_name  text,
  start_time  text,
  end_time    text,
  coach_name  text,
  outcome     text NOT NULL             -- 'booked' | 'standby'
);
