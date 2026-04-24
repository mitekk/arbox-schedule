import { apiFetch } from "../client";
import type { BookClassRequest, CancelClassRequest } from "../types/schedule";

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
