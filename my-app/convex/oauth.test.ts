// convex/oauth.test.ts
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";

const IP = "203.0.113.7";
const CLIENT = {
  clientId: "abc123abc123abc123abc123abc123ab",
  clientName: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  ip: IP,
};
const REDIRECT = CLIENT.redirectUris[0];
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

type T = ReturnType<typeof setupTest>;

async function mintCode(t: T, as: Awaited<ReturnType<typeof createTestUser>>["as"], codeHash: string) {
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
    ...overrides,
  };
}

describe("oauth", () => {
  let t: T;
  beforeEach(async () => {
    t = setupTest();
    await t.mutation(api.oauth.registerClient, CLIENT);
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
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-2", { codeChallenge: "WRONG" })),
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
    expect(
      await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-4")),
    ).toEqual({ revoked: true });
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
