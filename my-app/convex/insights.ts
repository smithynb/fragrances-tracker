// Read-only, insight-shaped queries for MCP agents. These exist so a connected
// agent can answer "summarize my collection / what should I wear tonight" in
// one or two tool calls instead of paging raw rows. Aggregation happens here,
// interpretation happens in the agent — no server-side AI (epic §1).
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getOptionalUserId } from "./helpers";

const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 500;
const DEFAULT_RECENT_LOGS = 5;
const MAX_RECENT_LOGS = 20;

export const listWearLogsFiltered = query({
  args: {
    bottleId: v.optional(v.id("bottles")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) return [];
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? DEFAULT_LOG_LIMIT), 1), MAX_LOG_LIMIT);
    const { from, to, bottleId } = args;

    // Both index shapes end in wornAt, so the range bounds stay in the index.
    // A bottleId the user doesn't own simply matches nothing — no leak.
    if (bottleId !== undefined) {
      return await ctx.db
        .query("wearLogs")
        .withIndex("by_user_bottle_time", (q) => {
          let r = q.eq("userId", userId).eq("bottleId", bottleId);
          if (from !== undefined) r = r.gte("wornAt", from);
          if (to !== undefined) r = r.lte("wornAt", to);
          return r;
        })
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("wearLogs")
      .withIndex("by_user_time", (q) => {
        let r = q.eq("userId", userId);
        if (from !== undefined) r = r.gte("wornAt", from);
        if (to !== undefined) r = r.lte("wornAt", to);
        return r;
      })
      .order("desc")
      .take(limit);
  },
});

type BottleAgg = {
  wears: number;
  sprays: number;
  ratingSum: number;
  ratingCount: number;
  lastWornAt: number | null;
};

function aggregate(bottles: Doc<"bottles">[], logs: Doc<"wearLogs">[]) {
  const byBottle = new Map<string, BottleAgg>();
  for (const bottle of bottles) {
    byBottle.set(bottle._id, { wears: 0, sprays: 0, ratingSum: 0, ratingCount: 0, lastWornAt: null });
  }
  for (const log of logs) {
    const agg = byBottle.get(log.bottleId);
    if (!agg) continue; // log for a just-deleted bottle; skip
    agg.wears += 1;
    agg.sprays += log.sprays;
    if (typeof log.rating === "number") {
      agg.ratingSum += log.rating;
      agg.ratingCount += 1;
    }
    if (agg.lastWornAt === null || log.wornAt > agg.lastWornAt) agg.lastWornAt = log.wornAt;
  }
  return byBottle;
}

function statsRow(bottle: Doc<"bottles">, agg: BottleAgg) {
  return {
    bottleId: bottle._id,
    name: bottle.name,
    brand: bottle.brand ?? null,
    isFavorite: bottle.isFavorite ?? false,
    wears: agg.wears,
    sprays: agg.sprays,
    avgRating: agg.ratingCount > 0 ? agg.ratingSum / agg.ratingCount : null,
    lastWornAt: agg.lastWornAt,
  };
}

async function loadUserData(ctx: QueryCtx, userId: Id<"users">) {
  const bottles = await ctx.db
    .query("bottles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const logs = await ctx.db
    .query("wearLogs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return { bottles, logs };
}

export const collectionStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return {
        totals: {
          bottleCount: 0, totalWears: 0, totalSprays: 0, favoriteCount: 0,
          unwornBottleCount: 0, mostWornBottleId: null, leastWornBottleId: null,
        },
        bottles: [],
      };
    }
    const { bottles, logs } = await loadUserData(ctx, userId);
    const byBottle = aggregate(bottles, logs);
    const rows = bottles.map((b) => statsRow(b, byBottle.get(b._id)!));

    // Ties broken by earliest createdAt so results are deterministic.
    const worn = bottles
      .filter((b) => byBottle.get(b._id)!.wears > 0)
      .sort((a, b) => a.createdAt - b.createdAt);
    let mostWorn: Doc<"bottles"> | null = null;
    let leastWorn: Doc<"bottles"> | null = null;
    for (const b of worn) {
      const wears = byBottle.get(b._id)!.wears;
      if (mostWorn === null || wears > byBottle.get(mostWorn._id)!.wears) mostWorn = b;
      if (leastWorn === null || wears < byBottle.get(leastWorn._id)!.wears) leastWorn = b;
    }

    return {
      totals: {
        bottleCount: bottles.length,
        totalWears: logs.length,
        totalSprays: logs.reduce((sum, l) => sum + l.sprays, 0),
        favoriteCount: bottles.filter((b) => b.isFavorite === true).length,
        unwornBottleCount: rows.filter((r) => r.wears === 0).length,
        mostWornBottleId: mostWorn?._id ?? null,
        leastWornBottleId: leastWorn?._id ?? null,
      },
      bottles: rows,
    };
  },
});

export const collectionSnapshot = query({
  args: { recentLogsPerBottle: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) return { generatedAt: Date.now(), bottles: [] };
    const recentCount = Math.min(
      Math.max(Math.trunc(args.recentLogsPerBottle ?? DEFAULT_RECENT_LOGS), 0),
      MAX_RECENT_LOGS,
    );
    const { bottles, logs } = await loadUserData(ctx, userId);
    const byBottle = aggregate(bottles, logs);

    const rows = await Promise.all(
      bottles.map(async (bottle) => {
        const recent =
          recentCount === 0
            ? []
            : await ctx.db
                .query("wearLogs")
                .withIndex("by_user_bottle_time", (q) =>
                  q.eq("userId", userId).eq("bottleId", bottle._id),
                )
                .order("desc")
                .take(recentCount);
        return {
          ...statsRow(bottle, byBottle.get(bottle._id)!),
          tags: bottle.tags ?? [],
          comments: bottle.comments ?? null,
          createdAt: bottle.createdAt,
          recentLogs: recent.map((l) => ({
            wornAt: l.wornAt,
            sprays: l.sprays,
            context: l.context ?? null,
            rating: l.rating ?? null,
            comment: l.comment ?? null,
          })),
        };
      }),
    );
    return { generatedAt: Date.now(), bottles: rows };
  },
});
