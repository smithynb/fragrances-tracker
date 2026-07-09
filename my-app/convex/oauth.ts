// convex/oauth.ts
// OAuth 2.1 storage layer. SECURITY MODEL: the *Next.js* routes generate every
// raw secret and hash it; these functions only store/compare hashes and opaque
// strings — no crypto here (Convex's default runtime lacks async crypto.subtle).
// registerClient / exchangeAuthCode / rotateRefreshToken are public mutations
// called server-side without user auth; they are IP-rate-limited, operate only
// on hashes, and fail uniformly with `invalid_grant` so nothing is enumerable.
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";
import { isValidRedirectUri, matchesRegisteredRedirect } from "../src/lib/mcp/oauth-validation";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // RFC 6749 §4.1.2: codes MUST be short-lived
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function invalidGrant(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "invalid_grant", message });
}

async function revokeGrantById(ctx: MutationCtx, grantId: Id<"oauthGrants">): Promise<void> {
  const now = Date.now();
  const grant = await ctx.db.get(grantId);
  if (grant && grant.revokedAt === undefined) {
    await ctx.db.patch(grantId, { revokedAt: now });
  }
  const tokens = await ctx.db
    .query("oauthRefreshTokens")
    .withIndex("by_grant", (q) => q.eq("grantId", grantId))
    .collect();
  await Promise.all(
    tokens
      .filter((t) => t.revokedAt === undefined)
      .map((t) => ctx.db.patch(t._id, { revokedAt: now })),
  );
}

async function findGrantForUserClient(
  ctx: MutationCtx,
  userId: Id<"users">,
  clientId: string,
): Promise<Doc<"oauthGrants"> | null> {
  const grants = await ctx.db
    .query("oauthGrants")
    .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", clientId))
    .collect();
  return grants.find((g) => g.revokedAt === undefined) ?? null;
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────

export const registerClient = mutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthRegister", { key: args.ip, throws: true });
    // Defense in depth: the Next route already validated; never trust one layer.
    if (args.redirectUris.length === 0 || !args.redirectUris.every(isValidRedirectUri)) {
      throw new ConvexError({
        code: "invalid_redirect_uri",
        message: "redirect_uris must be https, or http on localhost only, without fragments.",
      });
    }
    await ctx.db.insert("oauthClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      tokenEndpointAuthMethod: "none",
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getClientPublic = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client) return null;
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
    };
  },
});

// ── Authorization codes ───────────────────────────────────────────────────────

/** Called (authed) by the consent-page server action after the user approves. */
export const createAuthCode = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeHash: v.string(),
    codeChallenge: v.string(),
    scope: v.string(),
    resource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client || !matchesRegisteredRedirect(args.redirectUri, client.redirectUris)) {
      throw new ConvexError({ code: "invalid_request", message: "Unknown client or redirect URI." });
    }
    await ctx.db.insert("oauthAuthCodes", {
      codeHash: args.codeHash,
      clientId: args.clientId,
      userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      scope: args.scope,
      resource: args.resource,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
    return null;
  },
});

/**
 * Token-endpoint authorization_code grant. Atomically enforces single-use,
 * expiry, client/redirect binding, and PKCE, then upserts the grant and stores
 * the first refresh-token hash. Reuse of a consumed code revokes the grant
 * (RFC 6749 §4.1.2 SHOULD).
 */
export const exchangeAuthCode = mutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    refreshTokenHash: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthTokenExchange", { key: args.ip, throws: true });
    const now = Date.now();
    const code = await ctx.db
      .query("oauthAuthCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!code) throw invalidGrant("Unknown authorization code.");
    if (code.usedAt !== undefined) {
      // Reuse of a consumed code is theft evidence: revoke the grant and RETURN
      // (not throw) so the revocation commits — a throwing mutation rolls back
      // all its writes in Convex. The token route maps `{ revoked }` to 400
      // invalid_grant.
      const grant = await findGrantForUserClient(ctx, code.userId, code.clientId);
      if (grant) await revokeGrantById(ctx, grant._id);
      return { revoked: true as const };
    }
    if (code.expiresAt < now) throw invalidGrant("Authorization code expired.");
    if (code.clientId !== args.clientId) throw invalidGrant("Client mismatch.");
    if (code.redirectUri !== args.redirectUri) throw invalidGrant("redirect_uri mismatch.");
    if (code.codeChallenge !== args.codeChallenge) throw invalidGrant("PKCE verification failed.");

    await ctx.db.patch(code._id, { usedAt: now });

    let grant = await findGrantForUserClient(ctx, code.userId, code.clientId);
    if (grant) {
      await ctx.db.patch(grant._id, { lastUsedAt: now, scope: code.scope });
    } else {
      const client = await ctx.db
        .query("oauthClients")
        .withIndex("by_client_id", (q) => q.eq("clientId", code.clientId))
        .unique();
      const grantId = await ctx.db.insert("oauthGrants", {
        userId: code.userId,
        clientId: code.clientId,
        clientName: client?.clientName ?? code.clientId,
        scope: code.scope,
        createdAt: now,
      });
      grant = (await ctx.db.get(grantId))!;
    }

    await ctx.db.insert("oauthRefreshTokens", {
      tokenHash: args.refreshTokenHash,
      grantId: grant._id,
      userId: code.userId,
      clientId: code.clientId,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    });

    return { userId: code.userId, grantId: grant._id, scope: code.scope };
  },
});

// ── Refresh-token rotation ────────────────────────────────────────────────────

/**
 * Token-endpoint refresh_token grant. Every use rotates the token; presenting
 * a token that was already rotated or revoked is treated as theft and revokes
 * the entire grant including all descendant tokens.
 */
export const rotateRefreshToken = mutation({
  args: {
    tokenHash: v.string(),
    newTokenHash: v.string(),
    clientId: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthTokenExchange", { key: args.ip, throws: true });
    const now = Date.now();
    const token = await ctx.db
      .query("oauthRefreshTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) throw invalidGrant("Unknown refresh token.");
    if (token.revokedAt !== undefined || token.replacedBy !== undefined) {
      // Reuse detected (token already rotated or revoked). Revoke the whole
      // grant and RETURN so the revocation commits (a throw would roll it back).
      await revokeGrantById(ctx, token.grantId);
      return { revoked: true as const };
    }
    if (token.expiresAt < now) throw invalidGrant("Refresh token expired.");
    if (token.clientId !== args.clientId) throw invalidGrant("Client mismatch.");
    const grant = await ctx.db.get(token.grantId);
    if (!grant || grant.revokedAt !== undefined) throw invalidGrant("Grant revoked.");

    const newId = await ctx.db.insert("oauthRefreshTokens", {
      tokenHash: args.newTokenHash,
      grantId: token.grantId,
      userId: token.userId,
      clientId: token.clientId,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    });
    await ctx.db.patch(token._id, { replacedBy: newId });
    await ctx.db.patch(grant._id, { lastUsedAt: now });

    return { userId: token.userId, grantId: token.grantId, scope: grant.scope };
  },
});

// ── Settings UI ───────────────────────────────────────────────────────────────

export const listGrants = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const grants = await ctx.db
      .query("oauthGrants")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return grants
      .filter((g) => g.revokedAt === undefined)
      .map((g) => ({
        _id: g._id,
        clientName: g.clientName,
        scope: g.scope,
        createdAt: g.createdAt,
        lastUsedAt: g.lastUsedAt,
      }));
  },
});

export const revokeGrant = mutation({
  args: { grantId: v.id("oauthGrants") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.userId !== userId) {
      throw new Error("Grant not found or access denied.");
    }
    await revokeGrantById(ctx, args.grantId);
    return null;
  },
});
