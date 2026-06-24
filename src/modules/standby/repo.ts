import type { Db } from "../../platform/db";

export interface WatchEntry {
  scheduleId: number;
  seriesId: number;
  date: string; // YYYY-MM-DD
  className?: string;
  time?: string;
  endTime?: string;
  status: string;
}

const COLS = `schedule_id AS "scheduleId", series_id AS "seriesId",
              date::text AS date, class_name AS "className",
              start_time AS time, end_time AS "endTime", status`;

interface RawRow {
  scheduleId: string; // bigint comes back from pg as a string
  seriesId: string;
  date: string;
  className: string | null;
  time: string | null;
  endTime: string | null;
  status: string;
}

function toEntry(r: RawRow): WatchEntry {
  return {
    scheduleId: Number(r.scheduleId),
    seriesId: Number(r.seriesId),
    date: r.date,
    className: r.className ?? undefined,
    time: r.time ?? undefined,
    endTime: r.endTime ?? undefined,
    status: r.status,
  };
}

export async function listWatching(db: Db): Promise<WatchEntry[]> {
  const r = await db.query<RawRow>(
    `SELECT ${COLS} FROM standby.watch_entry WHERE status='watching' ORDER BY date, schedule_id`
  );
  return r.rows.map(toEntry);
}

export async function listAll(db: Db): Promise<WatchEntry[]> {
  const r = await db.query<RawRow>(
    `SELECT ${COLS} FROM standby.watch_entry ORDER BY date, schedule_id`
  );
  return r.rows.map(toEntry);
}

/** Insert a watch row; returns true if newly added (false if already tracked). */
export async function upsertWatch(
  db: Db,
  e: Omit<WatchEntry, "status">
): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO standby.watch_entry
       (schedule_id, series_id, date, class_name, start_time, end_time)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (schedule_id) DO NOTHING
     RETURNING schedule_id`,
    [e.scheduleId, e.seriesId, e.date, e.className, e.time, e.endTime]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function setStatus(
  db: Db,
  scheduleId: number,
  status: string
): Promise<void> {
  await db.query(
    `UPDATE standby.watch_entry SET status=$2, updated_at=now() WHERE schedule_id=$1`,
    [scheduleId, status]
  );
}
