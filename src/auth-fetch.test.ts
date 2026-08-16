import { beforeEach, describe, expect, it } from "vitest";
import { createAuthFetch } from "./auth-fetch.js";

let calls: { auth: string | null }[];
let validToken: string;
let mints: number;

const mockFetch: typeof globalThis.fetch = async (_input, init) => {
  const auth = new Headers(init?.headers).get("authorization");
  calls.push({ auth });
  const ok = auth === `Bearer ${validToken}`;
  return new Response(ok ? "{}" : '{"message":"unauthenticated"}', { status: ok ? 200 : 401 });
};

function makeAuth() {
  return createAuthFetch({
    token: "tok-1",
    fetch: mockFetch,
    getToken: async () => {
      mints += 1;
      await new Promise((r) => setTimeout(r, 10));
      return validToken;
    },
  });
}

beforeEach(() => {
  calls = [];
  validToken = "tok-1";
  mints = 0;
});

describe("createAuthFetch", () => {
  it("passes through with a single attempt while the token is valid", async () => {
    const auth = makeAuth();
    const res = await auth.fetch("https://x/a");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe("Bearer tok-1");
  });

  it("re-mints once on 401 and retries with the fresh token", async () => {
    const auth = makeAuth();
    validToken = "tok-2";
    const res = await auth.fetch("https://x/b");
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.auth)).toEqual(["Bearer tok-1", "Bearer tok-2"]);
    expect(mints).toBe(1);
  });

  it("shares one in-flight refresh across concurrent 401s", async () => {
    const auth = makeAuth();
    validToken = "tok-3";
    const results = await Promise.all([
      auth.fetch("https://x/c1"),
      auth.fetch("https://x/c2"),
      auth.fetch("https://x/c3"),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(mints).toBe(1);
  });

  it("applies setToken immediately without a request", async () => {
    const auth = makeAuth();
    validToken = "tok-4";
    auth.setToken("tok-4");
    const res = await auth.fetch("https://x/d");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("surfaces the 401 after one failed retry instead of looping", async () => {
    const auth = createAuthFetch({
      token: "nope",
      fetch: mockFetch,
      getToken: async () => "still-nope",
    });
    const res = await auth.fetch("https://x/e");
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(2);
  });

  it("returns the 401 untouched when no getToken is configured", async () => {
    const auth = createAuthFetch({ token: "nope", fetch: mockFetch });
    const res = await auth.fetch("https://x/f");
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
