import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getActiveOwnedBottle, getOptionalUserId, getOwnedDoc, getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";
import { buildPatch } from "./patch";
import { bottleDocValidator } from "./validators";

// ── Validation helpers ────────────────────────────────────────────────────────
// HTML min/max attributes are client-side only and trivially bypassed, so we
// enforce semantic bounds on the server where they cannot be skipped.

const MAX_NAME_LENGTH = 200;
const MAX_BRAND_LENGTH = 200;
const MAX_COMMENTS_LENGTH = 2000;
const MAX_TAG_LENGTH = 50;
const MAX_TAGS_COUNT = 20;
const MAX_SIZE_ML = 10_000; // 10 litres ought to be enough for anybody
const BOTTLE_DELETE_BATCH_SIZE = 50;
const BOTTLE_DELETE_WATCHDOG_DELAY_MS = 5 * 60 * 1000;

function assertValidBottleInput(args: {
  name?: string;
  brand?: string | null;
  comments?: string | null;
  tags?: string[] | null;
  sizeMl?: number | null;
}) {
  if (args.name !== undefined) {
    if (args.name.trim().length === 0) {
      throw new Error("Name is required.");
    }
    if (args.name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
  }
  if (args.brand && args.brand.length > MAX_BRAND_LENGTH) {
    throw new Error(`Brand must be at most ${MAX_BRAND_LENGTH} characters.`);
  }
  if (args.comments && args.comments.length > MAX_COMMENTS_LENGTH) {
    throw new Error(`Comments must be at most ${MAX_COMMENTS_LENGTH} characters.`);
  }
  if (args.tags) {
    if (args.tags.length > MAX_TAGS_COUNT) {
      throw new Error(`You can add at most ${MAX_TAGS_COUNT} tags.`);
    }
    if (args.tags.some((t) => t.length > MAX_TAG_LENGTH)) {
      throw new Error(`Each tag must be at most ${MAX_TAG_LENGTH} characters.`);
    }
  }
  if (args.sizeMl !== undefined && args.sizeMl !== null) {
    if (!Number.isFinite(args.sizeMl)) {
      throw new Error("sizeMl must be a finite number.");
    }
    if (args.sizeMl <= 0) {
      throw new Error("sizeMl must be greater than 0.");
    }
    if (args.sizeMl > MAX_SIZE_ML) {
      throw new Error(`Size must be at most ${MAX_SIZE_ML} mL.`);
    }
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const listBottles = query({
  args: {},
  returns: v.array(bottleDocValidator),
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return [];
    }

    return await ctx.db
      .query("bottles")
      .withIndex("by_user_and_deleting_at", (q) =>
        q.eq("userId", userId).eq("deletingAt", undefined),
      )
      .order("desc")
      .collect();
  },
});

export const getBottle = query({
  args: { bottleId: v.id("bottles") },
  returns: v.union(bottleDocValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return null;
    }

    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId || bottle.deletingAt !== undefined) return null;
    return bottle;
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const addBottle = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    sizeMl: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    comments: v.optional(v.string()),
  },
  returns: v.id("bottles"),
  handler: async (ctx, args) => {
    assertValidBottleInput(args);

    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "addBottle", { key: userId, throws: true });
    return await ctx.db.insert("bottles", {
      userId,
      name: args.name,
      brand: args.brand,
      sizeMl: args.sizeMl,
      tags: args.tags,
      comments: args.comments,
      createdAt: Date.now(),
    });
  },
});

export const updateBottle = mutation({
  args: {
    bottleId: v.id("bottles"),
    // name is required in the schema, so it cannot be cleared — only overwritten.
    name: v.optional(v.string()),
    // Optional fields accept null to explicitly clear the value.
    brand: v.optional(v.union(v.string(), v.null())),
    sizeMl: v.optional(v.union(v.number(), v.null())),
    tags: v.optional(v.union(v.array(v.string()), v.null())),
    comments: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "updateBottle", { key: userId, throws: true });
    await getActiveOwnedBottle(ctx, args.bottleId, userId);

    assertValidBottleInput(args);

    await ctx.db.patch(args.bottleId, {
      ...buildPatch({
        name: args.name,
        brand: args.brand,
        sizeMl: args.sizeMl,
        tags: args.tags,
        comments: args.comments,
      }),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteBottle = mutation({
  args: { bottleId: v.id("bottles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const bottle = await getOwnedDoc(ctx, "bottles", args.bottleId, userId);
    if (bottle.deletingAt !== undefined) {
      const cleanupJob = bottle.cleanupJobId
        ? await ctx.db.system.get("_scheduled_functions", bottle.cleanupJobId)
        : null;
      if (cleanupJob?.state.kind === "pending" || cleanupJob?.state.kind === "inProgress") {
        return null;
      }

      // A failed, canceled, completed-but-stale, or expired job record can be
      // repaired by a later delete request without changing the tombstone.
      await rateLimiter.limit(ctx, "deleteBottle", { key: userId, throws: true });
      const cleanupJobId = await ctx.scheduler.runAfter(0, internal.bottles.deleteBottleBatch, {
        bottleId: args.bottleId,
        expectedUserId: userId,
        expectedDeletingAt: bottle.deletingAt,
      });
      await ctx.db.patch(args.bottleId, { cleanupJobId });
      return null;
    }

    await rateLimiter.limit(ctx, "deleteBottle", { key: userId, throws: true });
    const deletingAt = Date.now();
    const cleanupJobId = await ctx.scheduler.runAfter(0, internal.bottles.deleteBottleBatch, {
      bottleId: args.bottleId,
      expectedUserId: userId,
      expectedDeletingAt: deletingAt,
    });
    await ctx.scheduler.runAfter(
      BOTTLE_DELETE_WATCHDOG_DELAY_MS,
      internal.bottles.watchBottleDeletion,
      {
        bottleId: args.bottleId,
        expectedUserId: userId,
        expectedDeletingAt: deletingAt,
      },
    );
    await ctx.db.patch(args.bottleId, { deletingAt, cleanupJobId });
    return null;
  },
});

/**
 * Removes one bounded batch of a bottle's children, then schedules the next
 * batch. The expected owner and tombstone make stale or misrouted jobs no-op;
 * the parent is only removed after no children remain.
 */
export const deleteBottleBatch = internalMutation({
  args: {
    bottleId: v.id("bottles"),
    expectedUserId: v.id("users"),
    expectedDeletingAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const bottle = await ctx.db.get(args.bottleId);
    if (
      !bottle ||
      bottle.userId !== args.expectedUserId ||
      bottle.deletingAt !== args.expectedDeletingAt
    ) {
      return null;
    }

    const logs = await ctx.db
      .query("wearLogs")
      .withIndex("by_bottle", (q) => q.eq("bottleId", args.bottleId))
      .take(BOTTLE_DELETE_BATCH_SIZE);
    await Promise.all(logs.map((log) => ctx.db.delete(log._id)));

    if (logs.length === BOTTLE_DELETE_BATCH_SIZE) {
      const cleanupJobId = await ctx.scheduler.runAfter(
        0,
        internal.bottles.deleteBottleBatch,
        args,
      );
      await ctx.db.patch(args.bottleId, { cleanupJobId });
    } else {
      await ctx.db.delete(args.bottleId);
    }
    return null;
  },
});

/**
 * Maintains one delayed recovery chain for each tombstone. Active cleanup is
 * left alone; terminal or missing work is replaced. Once the parent is gone or
 * the nonce no longer matches, the chain stops without touching data.
 */
export const watchBottleDeletion = internalMutation({
  args: {
    bottleId: v.id("bottles"),
    expectedUserId: v.id("users"),
    expectedDeletingAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const bottle = await ctx.db.get(args.bottleId);
    if (
      !bottle ||
      bottle.userId !== args.expectedUserId ||
      bottle.deletingAt !== args.expectedDeletingAt
    ) {
      return null;
    }

    const cleanupJob = bottle.cleanupJobId
      ? await ctx.db.system.get("_scheduled_functions", bottle.cleanupJobId)
      : null;
    if (cleanupJob?.state.kind !== "pending" && cleanupJob?.state.kind !== "inProgress") {
      const cleanupJobId = await ctx.scheduler.runAfter(
        0,
        internal.bottles.deleteBottleBatch,
        args,
      );
      await ctx.db.patch(args.bottleId, { cleanupJobId });
    }

    await ctx.scheduler.runAfter(
      BOTTLE_DELETE_WATCHDOG_DELAY_MS,
      internal.bottles.watchBottleDeletion,
      args,
    );
    return null;
  },
});

export const toggleFavorite = mutation({
  args: { bottleId: v.id("bottles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "toggleFavorite", {
      key: userId,
      throws: true,
    });

    const bottle = await getActiveOwnedBottle(ctx, args.bottleId, userId);

    // Intentionally do NOT touch updatedAt — favoriting is metadata, not a
    // content edit. Keeps any future "last modified" view honest.
    await ctx.db.patch(args.bottleId, {
      isFavorite: !(bottle.isFavorite ?? false),
    });
    return null;
  },
});
