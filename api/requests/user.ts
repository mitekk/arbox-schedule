import { apiFetch } from "../client";
import type { UserProfileResponse } from "../types/user";

export function getProfile(token: string): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>("/api/v2/user/profile", token);
}
