import { v } from "convex/values";

export const bottleDocValidator = v.object({
  _id: v.id("bottles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  brand: v.optional(v.string()),
  sizeMl: v.optional(v.number()),
  tags: v.optional(v.array(v.string())),
  comments: v.optional(v.string()),
  isFavorite: v.optional(v.boolean()),
  deletingAt: v.optional(v.number()),
  cleanupJobId: v.optional(v.id("_scheduled_functions")),
  cleanupStatus: v.optional(v.union(v.literal("pending"), v.literal("failed"))),
  cleanupAttempts: v.optional(v.number()),
  cleanupNextRetryAt: v.optional(v.number()),
  cleanupLastError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
});

// Failed deletion recovery intentionally exposes only the owner's bottle name
// and cleanup state. The hidden tombstone's other bottle fields and wear logs
// remain outside the recovery surface.
export const failedBottleDeletionValidator = v.object({
  _id: v.id("bottles"),
  name: v.string(),
  cleanupStatus: v.literal("failed"),
});

export const wearLogDocValidator = v.object({
  _id: v.id("wearLogs"),
  _creationTime: v.number(),
  userId: v.id("users"),
  bottleId: v.id("bottles"),
  wornAt: v.number(),
  sprays: v.number(),
  context: v.optional(v.string()),
  rating: v.optional(v.number()),
  comment: v.optional(v.string()),
});

export const bottleStatsValidator = v.object({
  wears: v.number(),
  sprays: v.number(),
  avgRating: v.union(v.number(), v.null()),
});
