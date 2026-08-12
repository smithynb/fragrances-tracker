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
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
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
