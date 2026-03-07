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
    // Efficient full-user log listing, ordered by wornAt descending via .order()
    .index("by_user", ["userId"])
    // Efficient per-user, per-bottle listing ordered by wornAt; eliminates JS-side filter
    .index("by_user_bottle_time", ["userId", "bottleId", "wornAt"]),
});
