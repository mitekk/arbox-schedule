import type { Db } from "../../platform/db";
import type { BookingIntent } from "./service";

/** Ensure a run row exists for the week (idempotent) and return its id. */
export async function ensureRun(db: Db, weekOf: string): Promise<string> {
  await db.query(
    `INSERT INTO booking.booking_run (week_of) VALUES ($1)
     ON CONFLICT (week_of) DO NOTHING`,
    [weekOf]
  );
  const r = await db.query<{ id: string }>(
    `SELECT id FROM booking.booking_run WHERE week_of=$1`,
    [weekOf]
  );
  return r.rows[0].id;
}

export async function hasRun(db: Db, weekOf: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM booking.booking_run WHERE week_of=$1`,
    [weekOf]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function recordLesson(
  db: Db,
  runId: string,
  intent: BookingIntent
): Promise<void> {
  await db.query(
    `INSERT INTO booking.booked_lesson
       (run_id, schedule_id, series_id, date, class_name, start_time, end_time, coach_name, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      runId,
      intent.scheduleId,
      intent.seriesId,
      intent.date,
      intent.className,
      intent.time,
      intent.endTime,
      intent.coachName,
      intent.action === "book" ? "booked" : "standby",
    ]
  );
}

export async function finishRun(
  db: Db,
  runId: string,
  slotsFilled: number
): Promise<void> {
  await db.query(`UPDATE booking.booking_run SET slots_filled=$2 WHERE id=$1`, [
    runId,
    slotsFilled,
  ]);
}
