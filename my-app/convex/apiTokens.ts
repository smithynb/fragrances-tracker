// convex/apiTokens.ts
// Personal access tokens for header-auth MCP clients (Claude Code, curl).
// Raw token ("fgt_..." format) is generated client/Next-side and shown once;
// only its SHA-256 hex hash reaches Convex.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";

const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const create = mutation({
  args: {
    tokenHash: v.string(),
    name: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "createApiToken", { key: userId, throws: true });
    if (args.name.length === 0 || args.name.length > 100) {
      throw new Error("Token name must be 1-100 characters.");
    }
    return await ctx.db.insert("personalAccessTokens", {
      userId,
      tokenHash: args.tokenHash,
      name: args.name,
      scopes: ["read", "write"],
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
  },
});

/**
 * Called (unauthenticated, server-side) by the MCP bearer verifier. A mutation
 * rather than a query so it can bump lastUsedAt — throttled to one write per
 * 5 minutes per token so hot agents don't burn mutation quota.
 */
export const validate = mutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const token = await ctx.db
      .query("personalAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) return null;
    if (token.revokedAt !== undefined) return null;
    if (token.expiresAt !== undefined && token.expiresAt < now) return null;
    if (token.lastUsedAt === undefined || now - token.lastUsedAt > LAST_USED_UPDATE_INTERVAL_MS) {
      await ctx.db.patch(token._id, { lastUsedAt: now });
    }
    return { userId: token.userId, tokenId: token._id, scopes: token.scopes };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const tokens = await ctx.db
      .query("personalAccessTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return tokens
      .filter((t) => t.revokedAt === undefined)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
      }));
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("personalAccessTokens") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const token = await ctx.db.get(args.tokenId);
    if (!token || token.userId !== userId) {
      throw new Error("Token not found or access denied.");
    }
    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
    return null;
  },
});
