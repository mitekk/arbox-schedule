import { apiFetch } from "../client";
import type {
  BookClassRequest,
  CancelClassRequest,
  StandByRequest,
  ScheduleBetweenDatesRequest,
  ScheduleResponse,
} from "../types/schedule";

export function getSchedule(
  token: string,
  body: ScheduleBetweenDatesRequest
): Promise<ScheduleResponse> {
  return apiFetch<ScheduleResponse>("/api/v2/schedule/betweenDates", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function bookClass(
  token: string,
  body: BookClassRequest
): Promise<unknown> {
  return apiFetch<unknown>("/api/v2/scheduleUser/insert", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function cancelClass(
  token: string,
  body: CancelClassRequest
): Promise<unknown> {
  return apiFetch<unknown>("/api/v2/scheduleUser/delete", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function joinStandBy(
  token: string,
  body: StandByRequest
): Promise<unknown> {
  return apiFetch<unknown>("/api/v2/scheduleStandBy/insert", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function leaveStandBy(
  token: string,
  body: StandByRequest
): Promise<unknown> {
  return apiFetch<unknown>("/api/v2/scheduleStandBy/delete", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
