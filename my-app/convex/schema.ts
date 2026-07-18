import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  bottles: defineTable({
    userId: v.id("users"),
    name: v.string(),

    brand: v.optional(v.string()),
    sizeMl: v.optional(v.number()),

    tags: v.optional(v.array(v.string())),
    comments: v.optional(v.string()),

    isFavorite: v.optional(v.boolean()),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  wearLogs: defineTable({
    userId: v.id("users"),

    bottleId: v.id("bottles"),

    wornAt: v.number(),
    sprays: v.number(),

    context: v.optional(v.string()),
    rating: v.optional(v.number()),

    comment: v.optional(v.string()),
  })
    .index("by_bottle", ["bottleId"])
    .index("by_bottle_time", ["bottleId", "wornAt"])
    .index("by_user", ["userId"])
    // Efficient full-user log listing, ordered by wornAt descending via .order()
    .index("by_user_time", ["userId", "wornAt"])
    // Efficient per-user, per-bottle listing ordered by wornAt; eliminates JS-side filter
    .index("by_user_bottle_time", ["userId", "bottleId", "wornAt"]),

  // ── MCP OAuth 2.1 + PAT tables. Secret-bearing fields store SHA-256 hex
  // hashes only; raw values are generated in Next.js and never reach Convex.
  oauthClients: defineTable({
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    tokenEndpointAuthMethod: v.literal("none"),
    createdAt: v.number(),
  }).index("by_client_id", ["clientId"]),

  oauthAuthCodes: defineTable({
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
    codeChallenge: v.string(), // S256 challenge, compared as an opaque string
    scope: v.string(),
    resource: v.optional(v.string()),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    grantId: v.optional(v.id("oauthGrants")),
  }).index("by_code_hash", ["codeHash"]),

  oauthGrants: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    clientName: v.string(), // denormalized for the settings UI
    scope: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_client", ["userId", "clientId"]),

  oauthRefreshTokens: defineTable({
    tokenHash: v.string(),
    grantId: v.id("oauthGrants"),
    userId: v.id("users"),
    clientId: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    replacedBy: v.optional(v.id("oauthRefreshTokens")), // rotation chain
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant", ["grantId"]),

  personalAccessTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),
});
