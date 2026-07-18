import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  mintAccessToken: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation(...args: unknown[]) {
      return mocks.mutation(...args);
    }
  },
}));

vi.mock("@/lib/mcp/tokens", () => ({
  ACCESS_TOKEN_TTL_SECONDS: 900,
  mintAccessToken: (...args: unknown[]) => mocks.mintAccessToken(...args),
}));

vi.mock("@/lib/mcp/token-crypto", () => ({
  randomToken: () => "new-refresh-token",
  sha256Hex: async (value: string) => `hash:${value}`,
}));

import { POST } from "./route";

const INTERNAL_SECRET = "test-oauth-internal-secret";
const VALID_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

function tokenRequest(params: Record<string, string>): Request {
  return new Request("https://app.example/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

describe("OAuth token route", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://convex.example");
    vi.stubEnv("OAUTH_INTERNAL_SECRET", INTERNAL_SECRET);
    mocks.mutation.mockReset().mockResolvedValue({
      userId: "user-1",
      grantId: "grant-1",
      scope: "read write",
    });
    mocks.mintAccessToken.mockReset().mockResolvedValue("access-token");
  });

  afterEach(() => vi.unstubAllEnvs());

  test.each(["a".repeat(42), "a".repeat(129), `${"a".repeat(42)}+`])(
    "rejects malformed code_verifier syntax",
    async (codeVerifier) => {
      const response = await POST(
        tokenRequest({
          grant_type: "authorization_code",
          code: "authorization-code",
          code_verifier: codeVerifier,
          client_id: "client-1",
          redirect_uri: "https://client.example/callback",
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
      expect(mocks.mutation).not.toHaveBeenCalled();
    },
  );

  test("passes the internal secret during authorization-code exchange", async () => {
    const response = await POST(
      tokenRequest({
        grant_type: "authorization_code",
        code: "authorization-code",
        code_verifier: VALID_VERIFIER,
        client_id: "client-1",
        redirect_uri: "https://client.example/callback",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        internalSecret: INTERNAL_SECRET,
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      }),
    );
  });

  test("passes the internal secret during refresh-token rotation", async () => {
    const response = await POST(
      tokenRequest({
        grant_type: "refresh_token",
        refresh_token: "old-refresh-token",
        client_id: "client-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ internalSecret: INTERNAL_SECRET }),
    );
  });
});
