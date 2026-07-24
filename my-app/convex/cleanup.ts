// convex/cleanup.ts
// Scheduled housekeeping for the MCP OAuth tables so expired/dead rows don't
// grow unbounded. Runs daily via convex/crons.ts. Nothing here weakens the
// security model — every purged row is already unusable:
//   - expired auth codes are rejected on exchange anyway;
//   - refresh tokens are only removed AFTER their 90-day expiry (revoked but
//     still-unexpired tokens are KEPT so rotation reuse-detection can still fire
//     on a stolen token and revoke the whole grant);
//   - PATs that are expired or revoked already validate to null.
import { internalMutation } from "./_generated/server";

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deleted = 0;

    for (const code of await ctx.db.query("oauthAuthCodes").collect()) {
      if (code.expiresAt < now) {
        await ctx.db.delete(code._id);
        deleted++;
      }
    }

    for (const token of await ctx.db.query("oauthRefreshTokens").collect()) {
      // Only past-expiry: keep revoked-but-unexpired tokens for reuse-detection.
      if (token.expiresAt < now) {
        await ctx.db.delete(token._id);
        deleted++;
      }
    }

    for (const pat of await ctx.db.query("personalAccessTokens").collect()) {
      if (pat.revokedAt !== undefined || (pat.expiresAt !== undefined && pat.expiresAt < now)) {
        await ctx.db.delete(pat._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
