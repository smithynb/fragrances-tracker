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

    // A tombstone makes deletion immediate to readers while the associated
    // wear logs are removed in bounded background batches.
    deletingAt: v.optional(v.number()),
    cleanupJobId: v.optional(v.id("_scheduled_functions")),
    // Cleanup retries are bounded. These fields remain optional so existing
    // bottles and tombstones can be upgraded without a blocking backfill.
    cleanupStatus: v.optional(v.union(v.literal("pending"), v.literal("failed"))),
    cleanupAttempts: v.optional(v.number()),
    cleanupNextRetryAt: v.optional(v.number()),
    cleanupLastError: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_deleting_at", ["userId", "deletingAt"])
    .index("by_user_and_cleanup_status", ["userId", "cleanupStatus"]),

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
});
