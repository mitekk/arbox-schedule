-- 0002_notification: the notification module's send-once dedupe ledger.

CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE notification.sent_email (
  dedupe_key text PRIMARY KEY,
  kind       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
