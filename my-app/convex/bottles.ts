import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOptionalUserId, getUserId } from "./helpers";

// ── Queries ──────────────────────────────────────────────────────────────────

export const listBottles = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return [];
    }

    return await ctx.db
      .query("bottles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getBottle = query({
  args: { bottleId: v.id("bottles") },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return null;
    }

    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId) return null;
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
  handler: async (ctx, args) => {
    if (args.sizeMl !== undefined && args.sizeMl <= 0) {
      throw new Error("sizeMl must be greater than 0.");
    }

    const userId = await getUserId(ctx);
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
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId) {
      throw new Error("Bottle not found or access denied.");
    }

    // Validate sizeMl when a real value (not a clear) is being set.
    if (args.sizeMl !== undefined && args.sizeMl !== null && args.sizeMl <= 0) {
      throw new Error("sizeMl must be greater than 0.");
    }

    // Build the patch explicitly so that:
    //   undefined  → field is omitted (no change)
    //   null       → field is set to undefined in the patch (clears it from the document)
    //   <value>    → field is updated to that value
    const patch: {
      name?: string;
      brand?: string;
      sizeMl?: number;
      tags?: string[];
      comments?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) patch.name = args.name;
    if (args.brand !== undefined) patch.brand = args.brand ?? undefined;
    if (args.sizeMl !== undefined) patch.sizeMl = args.sizeMl ?? undefined;
    if (args.tags !== undefined) patch.tags = args.tags ?? undefined;
    if (args.comments !== undefined)
      patch.comments = args.comments ?? undefined;

    await ctx.db.patch(args.bottleId, patch);
  },
});

export const deleteBottle = mutation({
  args: { bottleId: v.id("bottles") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const bottle = await ctx.db.get(args.bottleId);
    if (!bottle || bottle.userId !== userId) {
      throw new Error("Bottle not found or access denied.");
    }

    // Cascade-delete all wear logs that reference this bottle so no orphaned
    // records are left behind after the bottle document is removed.
    const orphanedLogs = await ctx.db
      .query("wearLogs")
      .withIndex("by_bottle", (q) => q.eq("bottleId", args.bottleId))
      .collect();

    await Promise.all(orphanedLogs.map((log) => ctx.db.delete(log._id)));

    await ctx.db.delete(args.bottleId);
  },
});
