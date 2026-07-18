import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockMutation = vi.hoisted(() => vi.fn());

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation(...args: unknown[]) {
      return mockMutation(...args);
    }
  },
}));

vi.mock("@/lib/mcp/token-crypto", () => ({ randomHex: () => "generated-client-id" }));

import { POST } from "./route";

const INTERNAL_SECRET = "test-oauth-internal-secret";

describe("OAuth registration route", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://convex.example");
    vi.stubEnv("OAUTH_INTERNAL_SECRET", INTERNAL_SECRET);
    mockMutation.mockReset().mockResolvedValue(null);
  });

  afterEach(() => vi.unstubAllEnvs());

  test("passes the internal secret to Convex", async () => {
    const response = await POST(
      new Request("https://app.example/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Example client",
          redirect_uris: ["https://client.example/callback"],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ internalSecret: INTERNAL_SECRET }),
    );
  });
});
