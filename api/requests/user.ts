import { apiFetch, BASE_URL } from "../client";
import type {
  UserProfileResponse,
  ResetPasswordRequest,
  ChangePasswordRequest,
} from "../types/user";

export function getProfile(token: string): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>("/api/v2/user/profile", token);
}

export async function resetPassword(body: ResetPasswordRequest): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v2/user/resetPassword`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyJson = await res.json().catch(() => null);
    throw new Error(`${res.status}: ${JSON.stringify(bodyJson)}`);
  }
}

export function changePassword(
  token: string,
  body: ChangePasswordRequest
): Promise<void> {
  return apiFetch<void>("/api/v2/user/changePassword", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
