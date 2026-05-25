export const BASE_URL = "https://apiappv2.arboxapp.com";

export async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit & { headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      accesstoken: token,
      version: "11",
      referername: "app",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: string | null = null;
    if (text) {
      try {
        body = JSON.stringify(JSON.parse(text));
      } catch {
        body = text.slice(0, 200);
      }
    }
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
