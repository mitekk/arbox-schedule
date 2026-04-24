import { BASE_URL } from "../client";
import type { LoginRequest, LoginResponse } from "../types/auth";

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/api/v2/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`Login failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json() as Promise<LoginResponse>;
}

export async function logout(token: string): Promise<void> {
  await fetch(`${BASE_URL}/api/v2/user/logout`, {
    method: "POST",
    headers: {
      accesstoken: token,
      version: "11",
      referername: "app",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
}
