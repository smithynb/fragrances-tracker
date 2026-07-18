// convex/oauth.test.ts
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";

const IP = "203.0.113.7";
const INTERNAL_SECRET = "test-oauth-internal-secret";
const CLIENT = {
  clientId: "abc123abc123abc123abc123abc123ab",
  clientName: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  ip: IP,
  internalSecret: INTERNAL_SECRET,
};
const REDIRECT = CLIENT.redirectUris[0];
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

type T = ReturnType<typeof setupTest>;

async function mintCode(
  t: T,
  as: Awaited<ReturnType<typeof createTestUser>>["as"],
  codeHash: string,
) {
  await as.mutation(api.oauth.createAuthCode, {
    clientId: CLIENT.clientId,
    redirectUri: REDIRECT,
    codeHash,
    codeChallenge: CHALLENGE,
    scope: "read write",
  });
}

function exchangeArgs(codeHash: string, overrides: Partial<Record<string, string>> = {}) {
  return {
    codeHash,
    clientId: CLIENT.clientId,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    refreshTokenHash: "rt-hash-1",
    ip: IP,
    internalSecret: INTERNAL_SECRET,
    ...overrides,
  };
}

describe("oauth", () => {
  let t: T;
  beforeEach(async () => {
    vi.stubEnv("OAUTH_INTERNAL_SECRET", INTERNAL_SECRET);
    t = setupTest();
    await t.mutation(api.oauth.registerClient, CLIENT);
  });

  afterEach(() => vi.unstubAllEnvs());

  test.each(["", "wrong-secret"])(
    "server-only mutations reject an invalid internal secret",
    async (internalSecret) => {
      const expected = JSON.stringify({
        code: "internal_error",
        message: "Internal server error.",
      });
      await expect(
        t.mutation(api.oauth.registerClient, {
          ...CLIENT,
          clientId: "otherotherotherotherotherotherot",
          internalSecret,
        }),
      ).rejects.toThrow(expected);
      await expect(
        t.mutation(api.oauth.exchangeAuthCode, {
          ...exchangeArgs("unknown"),
          internalSecret,
        }),
      ).rejects.toThrow(expected);
      await expect(
        t.mutation(api.oauth.rotateRefreshToken, {
          tokenHash: "unknown",
          newTokenHash: "new",
          clientId: CLIENT.clientId,
          ip: IP,
          internalSecret,
        }),
      ).rejects.toThrow(expected);
    },
  );

  test("server-only mutations fail uniformly when the deployment secret is missing", async () => {
    vi.stubEnv("OAUTH_INTERNAL_SECRET", "");
    await expect(
      t.mutation(api.oauth.registerClient, {
        ...CLIENT,
        clientId: "otherotherotherotherotherotherot",
      }),
    ).rejects.toThrow(
      JSON.stringify({ code: "internal_error", message: "Internal server error." }),
    );
  });

  test("registerClient rejects invalid redirect URIs", async () => {
    await expect(
      t.mutation(api.oauth.registerClient, {
        ...CLIENT,
        clientId: "otherotherotherotherotherotherot",
        redirectUris: ["http://evil.com/cb"],
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("registerClient rejects a duplicate clientId", async () => {
    await expect(t.mutation(api.oauth.registerClient, CLIENT)).rejects.toThrow(
      JSON.stringify({ code: "invalid_client_metadata", message: "Client registration failed." }),
    );
  });

  test("getClientPublic returns registered metadata, null for unknown", async () => {
    const client = await t.query(api.oauth.getClientPublic, { clientId: CLIENT.clientId });
    expect(client).toMatchObject({ clientName: "Claude", redirectUris: [REDIRECT] });
    expect(await t.query(api.oauth.getClientPublic, { clientId: "nope" })).toBeNull();
  });

  test("createAuthCode requires auth", async () => {
    await expect(
      t.mutation(api.oauth.createAuthCode, {
        clientId: CLIENT.clientId,
        redirectUri: REDIRECT,
        codeHash: "h",
        codeChallenge: CHALLENGE,
        scope: "read write",
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("createAuthCode rejects a malformed PKCE challenge", async () => {
    const { as } = await createTestUser(t);
    await expect(
      as.mutation(api.oauth.createAuthCode, {
        clientId: CLIENT.clientId,
        redirectUri: REDIRECT,
        codeHash: "h",
        codeChallenge: "too-short",
        scope: "read write",
      }),
    ).rejects.toThrow(
      JSON.stringify({ code: "invalid_request", message: "Invalid PKCE code challenge." }),
    );
  });

  test("exchangeAuthCode happy path creates a grant and returns it", async () => {
    const { userId, as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-1");
    const result = await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-1"));
    expect(result).toMatchObject({ userId, scope: "read write" });
    const grants = await as.query(api.oauth.listGrants, {});
    expect(grants).toHaveLength(1);
    expect(grants[0].clientName).toBe("Claude");
  });

  test("exchangeAuthCode rejects a wrong PKCE challenge", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-2");
    await expect(
      t.mutation(
        api.oauth.exchangeAuthCode,
        exchangeArgs("code-hash-2", { codeChallenge: "WRONG" }),
      ),
    ).rejects.toThrow(ConvexError);
  });

  test("exchangeAuthCode rejects mismatched redirectUri and clientId", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-3");
    await expect(
      t.mutation(
        api.oauth.exchangeAuthCode,
        exchangeArgs("code-hash-3", { redirectUri: "https://claude.ai/other" }),
      ),
    ).rejects.toThrow(ConvexError);
    await expect(
      t.mutation(
        api.oauth.exchangeAuthCode,
        exchangeArgs("code-hash-3", { clientId: "wrongwrongwrongwrongwrongwrongwr" }),
      ),
    ).rejects.toThrow(ConvexError);
  });

  test("a code is single-use; reuse revokes the grant", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-4");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-4"));
    // Reuse returns the revocation sentinel (not a throw) so the revoke commits.
    expect(await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-4"))).toEqual({
      revoked: true,
    });
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);
  });

  test("expired codes are rejected", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-5");
    await t.run(async (ctx) => {
      const code = await ctx.db
        .query("oauthAuthCodes")
        .withIndex("by_code_hash", (q) => q.eq("codeHash", "code-hash-5"))
        .unique();
      await ctx.db.patch(code!._id, { expiresAt: Date.now() - 1 });
    });
    await expect(
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-5")),
    ).rejects.toThrow(ConvexError);
  });

  test("replay of an expired consumed code does not revoke its grant", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-expired-replay");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-expired-replay"));
    await t.run(async (ctx) => {
      const code = await ctx.db
        .query("oauthAuthCodes")
        .withIndex("by_code_hash", (q) => q.eq("codeHash", "code-hash-expired-replay"))
        .unique();
      await ctx.db.patch(code!._id, { expiresAt: Date.now() - 1 });
    });

    await expect(
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-expired-replay")),
    ).rejects.toThrow(ConvexError);
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(1);
  });

  test("replay revokes only the grant created by that authorization code", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-old-grant");
    const first = await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-old-grant"));
    if ("revoked" in first) throw new Error("Expected initial exchange to succeed.");
    await as.mutation(api.oauth.revokeGrant, { grantId: first.grantId });

    await mintCode(t, as, "code-hash-new-grant");
    const second = await t.mutation(
      api.oauth.exchangeAuthCode,
      exchangeArgs("code-hash-new-grant", { refreshTokenHash: "rt-hash-new-grant" }),
    );
    if ("revoked" in second) throw new Error("Expected second exchange to succeed.");
    expect(second.grantId).not.toBe(first.grantId);

    expect(
      await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-old-grant")),
    ).toEqual({ revoked: true });
    const grants = await as.query(api.oauth.listGrants, {});
    expect(grants).toHaveLength(1);
    expect(grants[0]._id).toBe(second.grantId);
  });

  test("refresh rotation works and reuse of a rotated token revokes the whole grant", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-6");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-6"));

    // Rotate rt-hash-1 → rt-hash-2: OK.
    const rotated = await t.mutation(api.oauth.rotateRefreshToken, {
      tokenHash: "rt-hash-1",
      newTokenHash: "rt-hash-2",
      clientId: CLIENT.clientId,
      ip: IP,
      internalSecret: INTERNAL_SECRET,
    });
    expect(rotated).toMatchObject({ scope: "read write" });

    // Reusing the rotated rt-hash-1 is theft evidence → whole grant dies.
    // Returns the sentinel (not a throw) so the revocation commits.
    expect(
      await t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-1",
        newTokenHash: "rt-hash-3",
        clientId: CLIENT.clientId,
        ip: IP,
        internalSecret: INTERNAL_SECRET,
      }),
    ).toEqual({ revoked: true });
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);

    // The descendant token is dead too (revoked with the grant).
    expect(
      await t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-2",
        newTokenHash: "rt-hash-4",
        clientId: CLIENT.clientId,
        ip: IP,
        internalSecret: INTERNAL_SECRET,
      }),
    ).toEqual({ revoked: true });
  });

  test("revokeGrant hides the grant and kills its refresh tokens", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-7");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-7"));
    const [grant] = await as.query(api.oauth.listGrants, {});
    await as.mutation(api.oauth.revokeGrant, { grantId: grant._id });
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);
    // Presenting a refresh token whose grant was revoked returns the sentinel.
    expect(
      await t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-1",
        newTokenHash: "rt-hash-9",
        clientId: CLIENT.clientId,
        ip: IP,
        internalSecret: INTERNAL_SECRET,
      }),
    ).toEqual({ revoked: true });
  });

  test("revokeGrant rejects a grant owned by another user", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    await mintCode(t, as, "code-hash-8");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-8"));
    const [grant] = await as.query(api.oauth.listGrants, {});
    await expect(asOther.mutation(api.oauth.revokeGrant, { grantId: grant._id })).rejects.toThrow();
  });
});
