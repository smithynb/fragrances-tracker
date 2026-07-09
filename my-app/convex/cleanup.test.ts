import { beforeEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { setupTest } from "./test.setup";

type T = ReturnType<typeof setupTest>;

const NOW = Date.now();
const PAST = NOW - 60_000;
const FUTURE = NOW + 60 * 60_000;

describe("cleanup.purgeExpired", () => {
  let t: T;
  beforeEach(() => {
    t = setupTest();
  });

  test("purges expired codes, expired refresh tokens, and expired/revoked PATs; keeps fresh rows and revoked-but-unexpired refresh tokens", async () => {
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "u" });
      const grantId = await ctx.db.insert("oauthGrants", {
        userId,
        clientId: "c",
        clientName: "C",
        scope: "read write",
        createdAt: NOW,
      });
      const code = (extra: { codeHash: string; expiresAt: number }) =>
        ctx.db.insert("oauthAuthCodes", {
          clientId: "c",
          userId,
          redirectUri: "https://a.example/cb",
          codeChallenge: "x",
          scope: "read write",
          ...extra,
        });
      await code({ codeHash: "code-expired", expiresAt: PAST });
      await code({ codeHash: "code-fresh", expiresAt: FUTURE });

      const rt = (extra: { tokenHash: string; expiresAt: number; revokedAt?: number }) =>
        ctx.db.insert("oauthRefreshTokens", { grantId, userId, clientId: "c", ...extra });
      await rt({ tokenHash: "rt-expired", expiresAt: PAST });
      // Revoked but not yet expired: must be KEPT so rotation reuse-detection
      // can still revoke the whole grant if the stolen token is presented.
      await rt({ tokenHash: "rt-revoked-unexpired", expiresAt: FUTURE, revokedAt: NOW });
      await rt({ tokenHash: "rt-fresh", expiresAt: FUTURE });

      const pat = (extra: { tokenHash: string; expiresAt?: number; revokedAt?: number }) =>
        ctx.db.insert("personalAccessTokens", {
          userId,
          name: "p",
          scopes: ["read", "write"],
          createdAt: NOW,
          ...extra,
        });
      await pat({ tokenHash: "pat-expired", expiresAt: PAST });
      await pat({ tokenHash: "pat-revoked", revokedAt: NOW });
      await pat({ tokenHash: "pat-active" });
    });

    await t.mutation(internal.cleanup.purgeExpired, {});

    await t.run(async (ctx) => {
      const codes = (await ctx.db.query("oauthAuthCodes").collect()).map((c) => c.codeHash);
      expect(codes).toEqual(["code-fresh"]);

      const rts = (await ctx.db.query("oauthRefreshTokens").collect())
        .map((r) => r.tokenHash)
        .sort();
      expect(rts).toEqual(["rt-fresh", "rt-revoked-unexpired"]);

      const pats = (await ctx.db.query("personalAccessTokens").collect()).map((p) => p.tokenHash);
      expect(pats).toEqual(["pat-active"]);
    });
  });
});
