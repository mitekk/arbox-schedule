-- 0003_standby: the standby watchlist (replaces state.json). Owned by standby.

CREATE SCHEMA IF NOT EXISTS standby;

CREATE TABLE standby.watch_entry (
  schedule_id bigint PRIMARY KEY,         -- one row per slot; ON CONFLICT DO NOTHING
  series_id   bigint NOT NULL,
  date        date NOT NULL,
  class_name  text,
  start_time  text,
  end_time    text,
  status      text NOT NULL DEFAULT 'watching', -- watching|confirmed|lost|expired
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
