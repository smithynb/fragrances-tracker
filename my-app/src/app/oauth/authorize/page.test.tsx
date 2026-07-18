import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchQuery: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => mocks.fetchQuery(...args),
}));

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: async () => "auth-token",
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}));

vi.mock("./actions", () => ({
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
}));

import AuthorizePage from "./page";

const VALID_PARAMS = {
  client_id: "client-1",
  redirect_uri: "https://client.example/callback?existing=1",
  response_type: "code",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
};

describe("AuthorizePage", () => {
  beforeEach(() => {
    mocks.fetchQuery.mockReset();
    mocks.redirect.mockReset().mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  test("prominently identifies the redirect origin and unverified client status", async () => {
    mocks.fetchQuery
      .mockResolvedValueOnce({
        clientId: "client-1",
        clientName: "Friendly-looking name",
        redirectUris: [VALID_PARAMS.redirect_uri],
      })
      .mockResolvedValueOnce({ email: "user@example.test" });

    render(await AuthorizePage({ searchParams: Promise.resolve(VALID_PARAMS) }));

    expect(screen.getByText("https://client.example")).toBeInTheDocument();
    expect(
      screen.getByText(/This app was registered automatically and is not verified/),
    ).toBeInTheDocument();
  });

  test("rejects malformed PKCE challenges before rendering consent", async () => {
    mocks.fetchQuery.mockResolvedValueOnce({
      clientId: "client-1",
      clientName: "Example",
      redirectUris: [VALID_PARAMS.redirect_uri],
    });

    await expect(
      AuthorizePage({
        searchParams: Promise.resolve({ ...VALID_PARAMS, code_challenge: "too-short" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining("error=invalid_request"));
  });
});
