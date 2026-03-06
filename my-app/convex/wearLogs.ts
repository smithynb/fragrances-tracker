import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./helpers";

// ── Queries ──────────────────────────────────────────────────────────────────

export const listBottleStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const logs = await ctx.db
      .query("wearLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Aggregate wear count and spray totals per bottle server-side so the
    // collection view never needs to download the full wear-log history.
    const stats = new Map<string, { wears: number; sprays: number }>();
    for (const log of logs) {
      const existing = stats.get(log.bottleId) ?? { wears: 0, sprays: 0 };
      existing.wears += 1;
      existing.sprays += log.sprays;
      stats.set(log.bottleId, existing);
    }
    return Object.fromEntries(stats);
  },
});

export const listWearLogs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    // Uses the by_user index — no full-table scan, no in-memory filter.
    return await ctx.db
      .query("wearLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const listWearLogsByBottle = query({
  args: { bottleId: v.id("bottles") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    // Uses the compound by_user_bottle_time index so both the userId and
    // bottleId filters are satisfied in the index (no JS-side filtering),
    // and results arrive ordered by wornAt descending via .order("desc").
    return await ctx.db
      .query("wearLogs")
      .withIndex("by_user_bottle_time", (q) =>
        q.eq("userId", userId).eq("bottleId", args.bottleId),
      )
      .order("desc")
      .collect();
  },
});

export const getWearLog = query({
  args: { wearLogId: v.id("wearLogs") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const log = await ctx.db.get(args.wearLogId);
    if (!log || log.userId !== userId) return null;
    return log;
  },
});

// ── Validation helpers ────────────────────────────────────────────────────────

function assertValidWornAt(wornAt: number): void {
  if (wornAt <= 0) {
    throw new Error("wornAt must be a positive Unix timestamp (ms).");
  }
}

function assertValidSprays(sprays: number): void {
  if (!Number.isInteger(sprays) || sprays < 1) {
    throw new Error("sprays must be a whole number of at least 1.");
  }
}

function assertValidRating(rating: number): void {
  if (rating < 1 || rating > 10) {
    throw new Error("rating must be between 1 and 10 inclusive.");
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export const addWearLog = mutation({
  args: {
    bottleId: v.id("bottles"),
    wornAt: v.number(),
    sprays: v.number(),
    context: v.optional(v.string()),
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertValidWornAt(args.wornAt);
    assertValidSprays(args.sprays);
    if (args.rating !== undefined) assertValidRating(args.rating);

    const userId = await getUserId(ctx);

    // Verify the bottle belongs to this user.
    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId) {
      throw new Error("Bottle not found or access denied.");
    }

    return await ctx.db.insert("wearLogs", {
      userId,
      bottleId: args.bottleId,
      wornAt: args.wornAt,
      sprays: args.sprays,
      context: args.context,
      rating: args.rating,
      comment: args.comment,
    });
  },
});

export const updateWearLog = mutation({
  args: {
    wearLogId: v.id("wearLogs"),
    // Required fields can be overwritten but not cleared.
    wornAt: v.optional(v.number()),
    sprays: v.optional(v.number()),
    // Optional fields accept null to explicitly clear the stored value.
    context: v.optional(v.union(v.string(), v.null())),
    rating: v.optional(v.union(v.number(), v.null())),
    comment: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // Run validation before the ownership check so the error is clear even
    // in cases where the log is not found.
    if (args.wornAt !== undefined) assertValidWornAt(args.wornAt);
    if (args.sprays !== undefined) assertValidSprays(args.sprays);
    if (args.rating !== undefined && args.rating !== null)
      assertValidRating(args.rating);

    const userId = await getUserId(ctx);
    const log = await ctx.db.get(args.wearLogId);
    if (!log || log.userId !== userId) {
      throw new Error("Wear log not found or access denied.");
    }

    // Build the patch explicitly so that:
    //   undefined  → field is omitted (no change)
    //   null       → field is set to undefined in the patch (clears it from the document)
    //   <value>    → field is updated to that value
    const patch: {
      wornAt?: number;
      sprays?: number;
      context?: string;
      rating?: number;
      comment?: string;
    } = {};

    if (args.wornAt !== undefined) patch.wornAt = args.wornAt;
    if (args.sprays !== undefined) patch.sprays = args.sprays;
    if (args.context !== undefined) patch.context = args.context ?? undefined;
    if (args.rating !== undefined) patch.rating = args.rating ?? undefined;
    if (args.comment !== undefined) patch.comment = args.comment ?? undefined;

    await ctx.db.patch(args.wearLogId, patch);
  },
});

export const deleteWearLog = mutation({
  args: { wearLogId: v.id("wearLogs") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const log = await ctx.db.get(args.wearLogId);
    if (!log || log.userId !== userId) {
      throw new Error("Wear log not found or access denied.");
    }
    await ctx.db.delete(args.wearLogId);
  },
});
