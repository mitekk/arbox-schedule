import { login } from "../../../api/requests/auth";

export interface ArboxSession {
  /** Run `fn` with a valid Arbox token. The login is lazy and shared across
   *  concurrent callers; the token is never proactively logged out (so one
   *  caller's completion can't invalidate a peer mid-call). On an auth failure
   *  the cached token is dropped so the NEXT call re-logs-in — `fn` is never
   *  re-run (it may have side effects). */
  withSession<T>(fn: (token: string) => Promise<T>): Promise<T>;
}

function isAuthError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return m.startsWith("401") || m.startsWith("403");
}

export function createSession(creds: {
  email: string;
  password: string;
}): ArboxSession {
  let tokenPromise: Promise<string> | null = null;

  function getToken(): Promise<string> {
    if (!tokenPromise) {
      tokenPromise = login({
        email: creds.email,
        password: creds.password,
      })
        .then((r) => r.data.token)
        .catch((err) => {
          tokenPromise = null; // allow a retry on the next call
          throw err;
        });
    }
    return tokenPromise;
  }

  async function withSession<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await getToken();
    try {
      return await fn(token);
    } catch (err) {
      if (isAuthError(err)) tokenPromise = null; // force re-login next time
      throw err;
    }
  }

  return { withSession };
}
