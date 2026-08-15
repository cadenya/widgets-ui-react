export interface AuthFetchOptions {
  /** The current session token. */
  token: string;
  /**
   * Re-mint callback for expiry. The widget surface has no refresh endpoint
   * by design: this calls the embedder's backend, which re-validates the
   * visitor against its own auth and returns a fresh token (re-minting for
   * the same widget/subject returns the existing active session).
   */
  getToken?: () => Promise<string>;
  /** Underlying fetch; defaults to a bound global fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface AuthFetch {
  /** Fetch that injects the current token and retries once on 401. */
  fetch: typeof globalThis.fetch;
  /** Replace the current token (e.g. the embedder re-minted externally). */
  setToken: (token: string) => void;
}

/**
 * Owns the Authorization header for a widget client: every request carries
 * the current token, and a 401 triggers one re-mint via getToken followed by
 * a single retry. Concurrent 401s share one in-flight refresh. Because the
 * wrapper overwrites the header, the client instance itself never needs
 * recreating when the token rotates — open streams and hook subscriptions
 * survive a refresh untouched.
 */
export function createAuthFetch(options: AuthFetchOptions): AuthFetch {
  const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const getToken = options.getToken;
  let token = options.token;
  let refreshing: Promise<string> | null = null;

  const refresh = () =>
    (refreshing ??= Promise.resolve()
      .then(() => getToken!())
      .then((fresh) => {
        token = fresh;
        return fresh;
      })
      .finally(() => {
        refreshing = null;
      }));

  const authFetch: typeof globalThis.fetch = async (input, init) => {
    const attempt = (current: string) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${current}`);
      return baseFetch(input, { ...init, headers });
    };
    let res = await attempt(token);
    if (res.status === 401 && getToken) {
      res = await attempt(await refresh());
    }
    return res;
  };

  return {
    fetch: authFetch,
    setToken: (fresh) => {
      token = fresh;
    },
  };
}
