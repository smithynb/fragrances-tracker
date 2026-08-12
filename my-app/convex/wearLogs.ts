import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getActiveOwnedBottle, getOptionalUserId, getOwnedDoc, getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";
import { MAX_SPRAYS } from "../src/lib/constants";
import { buildPatch } from "./patch";
import { bottleStatsValidator, wearLogDocValidator } from "./validators";

// ── Validation constants ──────────────────────────────────────────────────────

const MAX_COMMENT_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 200;
const FUTURE_WORN_AT_TOLERANCE_MS = 60_000;

// ── Queries ──────────────────────────────────────────────────────────────────

export const listBottleStats = query({
  args: {},
  returns: v.record(v.string(), bottleStatsValidator),
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return {};
    }

    const [logs, deletingBottles] = await Promise.all([
      ctx.db
        .query("wearLogs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("bottles")
        .withIndex("by_user_and_deleting_at", (q) => q.eq("userId", userId).gt("deletingAt", 0))
        .collect(),
    ]);
    const deletingBottleIds = new Set(deletingBottles.map((bottle) => bottle._id));
    // Aggregate wear count, spray totals, and average rating per bottle
    // server-side so the collection view never needs to download the full
    // wear-log history.
    const stats = new Map<
      string,
      { wears: number; sprays: number; ratingSum: number; ratingCount: number }
    >();
    for (const log of logs) {
      if (deletingBottleIds.has(log.bottleId)) continue;
      const existing = stats.get(log.bottleId) ?? {
        wears: 0,
        sprays: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
      existing.wears += 1;
      existing.sprays += log.sprays;
      if (typeof log.rating === "number") {
        existing.ratingSum += log.rating;
        existing.ratingCount += 1;
      }
      stats.set(log.bottleId, existing);
    }
    return Object.fromEntries(
      Array.from(stats.entries()).map(([bottleId, s]) => [
        bottleId,
        {
          wears: s.wears,
          sprays: s.sprays,
          avgRating: s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null,
        },
      ]),
    );
  },
});

export const listWearLogs = query({
  args: {},
  returns: v.array(wearLogDocValidator),
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return [];
    }

    const [logs, deletingBottles] = await Promise.all([
      ctx.db
        .query("wearLogs")
        .withIndex("by_user_time", (q) => q.eq("userId", userId))
        .order("desc")
        .collect(),
      ctx.db
        .query("bottles")
        .withIndex("by_user_and_deleting_at", (q) => q.eq("userId", userId).gt("deletingAt", 0))
        .collect(),
    ]);
    const deletingBottleIds = new Set(deletingBottles.map((bottle) => bottle._id));
    return logs.filter((log) => !deletingBottleIds.has(log.bottleId));
  },
});

export const listWearLogsByBottle = query({
  args: { bottleId: v.id("bottles") },
  returns: v.array(wearLogDocValidator),
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return [];
    }

    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId || bottle.deletingAt !== undefined) {
      return [];
    }

    // Uses the compound by_user_bottle_time index so both the userId and
    // bottleId filters are satisfied in the index (no JS-side filtering),
    // and results arrive ordered by wornAt descending via .order("desc").
    return await ctx.db
      .query("wearLogs")
      .withIndex("by_user_bottle_time", (q) => q.eq("userId", userId).eq("bottleId", args.bottleId))
      .order("desc")
      .collect();
  },
});

export const getWearLog = query({
  args: { wearLogId: v.id("wearLogs") },
  returns: v.union(wearLogDocValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return null;
    }

    const log = await ctx.db.get(args.wearLogId);
    if (!log || log.userId !== userId) return null;
    const bottle = await ctx.db.get(log.bottleId);
    if (!bottle || bottle.userId !== userId || bottle.deletingAt !== undefined) return null;
    return log;
  },
});

// ── Validation helpers ────────────────────────────────────────────────────────

function assertValidWornAt(wornAt: number): void {
  if (!Number.isFinite(wornAt)) {
    throw new Error("wornAt must be a finite number.");
  }
  if (wornAt <= 0) {
    throw new Error("wornAt must be a positive Unix timestamp (ms).");
  }
  if (wornAt > Date.now() + FUTURE_WORN_AT_TOLERANCE_MS) {
    throw new Error("wornAt cannot be in the future.");
  }
}

function assertValidSprays(sprays: number): void {
  if (!Number.isInteger(sprays) || sprays < 1) {
    throw new Error("sprays must be a whole number of at least 1.");
  }
  if (sprays > MAX_SPRAYS) {
    throw new Error(`sprays must be at most ${MAX_SPRAYS}.`);
  }
}

function assertValidRating(rating: number): void {
  if (!Number.isFinite(rating)) {
    throw new Error("rating must be a finite number.");
  }
  if (rating < 1 || rating > 10) {
    throw new Error("rating must be between 1 and 10 inclusive.");
  }
}

function assertValidWearLogStrings(args: {
  comment?: string | null;
  context?: string | null;
}): void {
  if (args.comment != null && args.comment.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be at most ${MAX_COMMENT_LENGTH} characters.`);
  }
  if (args.context != null && args.context.length > MAX_CONTEXT_LENGTH) {
    throw new Error(`Context must be at most ${MAX_CONTEXT_LENGTH} characters.`);
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
  returns: v.id("wearLogs"),
  handler: async (ctx, args) => {
    assertValidWornAt(args.wornAt);
    assertValidSprays(args.sprays);
    if (args.rating !== undefined) assertValidRating(args.rating);

    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "addWearLog", { key: userId, throws: true });

    // Verify the bottle belongs to this user and is not being deleted.
    await getActiveOwnedBottle(ctx, args.bottleId, userId);

    // Validate string lengths server-side (HTML max is client-only).
    assertValidWearLogStrings(args);

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
  returns: v.null(),
  handler: async (ctx, args) => {
    // Run validation before the ownership check so the error is clear even
    // in cases where the log is not found.
    if (args.wornAt !== undefined) assertValidWornAt(args.wornAt);
    if (args.sprays !== undefined) assertValidSprays(args.sprays);
    if (args.rating !== undefined && args.rating !== null) assertValidRating(args.rating);

    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "updateWearLog", { key: userId, throws: true });
    const log = await getOwnedDoc(ctx, "wearLogs", args.wearLogId, userId);

    // Updates to a child that is already scheduled for deletion are rejected:
    // the change would never become durable user-visible state. Deletes remain
    // allowed and safely reduce the cleanup worker's remaining batch.
    await getActiveOwnedBottle(ctx, log.bottleId, userId);

    // Validate string lengths server-side.
    assertValidWearLogStrings(args);

    await ctx.db.patch(
      args.wearLogId,
      buildPatch({
        wornAt: args.wornAt,
        sprays: args.sprays,
        context: args.context,
        rating: args.rating,
        comment: args.comment,
      }),
    );
    return null;
  },
});

export const deleteWearLog = mutation({
  args: { wearLogId: v.id("wearLogs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "deleteWearLog", { key: userId, throws: true });
    await getOwnedDoc(ctx, "wearLogs", args.wearLogId, userId);
    await ctx.db.delete(args.wearLogId);
    return null;
  },
});
