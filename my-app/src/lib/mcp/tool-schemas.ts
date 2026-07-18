// Zod raw shapes for MCP tool inputs. These mirror the server-side bounds in
// convex/bottles.ts and convex/wearLogs.ts to give agents early, descriptive
// validation errors — the Convex validators remain authoritative.
import { z } from "zod";
import { MAX_SPRAYS } from "@/lib/constants";

const bottleId = z.string().describe("Bottle ID from list_fragrances / get_fragrance_stats.");
const wearLogId = z.string().describe("Wear log ID from list_fragrance_wears.");

const name = z.string().min(1).max(200);
const brand = z.string().max(200);
const sizeMl = z.number().positive().max(10_000).describe("Bottle size in millilitres.");
const tags = z.array(z.string().min(1).max(50)).max(20);
const comments = z.string().max(2000);

const wornAt = z
  .number()
  .int()
  .positive()
  .describe("Wear time as Unix epoch milliseconds (convert ISO dates: Date.parse). Must not be in the future.");
const sprays = z.number().int().min(1).max(MAX_SPRAYS);
const context = z.string().max(200).describe('Occasion, e.g. "office", "date night".');
const rating = z.number().min(1).max(10);
const wearComment = z.string().max(2000);

export const listBottlesShape = {};
export const getBottleShape = { bottleId };

export const addBottleShape = {
  name,
  brand: brand.optional(),
  sizeMl: sizeMl.optional(),
  tags: tags.optional(),
  comments: comments.optional(),
};

// null clears a field (buildPatch semantics); name is required in the schema
// so it can be overwritten but never cleared.
export const updateBottleShape = {
  bottleId,
  name: name.optional(),
  brand: brand.nullable().optional(),
  sizeMl: sizeMl.nullable().optional(),
  tags: tags.nullable().optional(),
  comments: comments.nullable().optional(),
};

export const deleteBottleShape = { bottleId };
export const toggleFavoriteShape = { bottleId };

export const addWearLogShape = {
  bottleId,
  wornAt,
  sprays,
  context: context.optional(),
  rating: rating.optional(),
  comment: wearComment.optional(),
};

export const updateWearLogShape = {
  wearLogId,
  wornAt: wornAt.optional(),
  sprays: sprays.optional(),
  context: context.nullable().optional(),
  rating: rating.nullable().optional(),
  comment: wearComment.nullable().optional(),
};

export const deleteWearLogShape = { wearLogId };

export const listWearLogsShape = {
  bottleId: bottleId.optional(),
  from: z.number().int().optional().describe("Inclusive lower bound, epoch ms."),
  to: z.number().int().optional().describe("Inclusive upper bound, epoch ms."),
  limit: z.number().int().min(1).max(500).optional().describe("Max logs to return (default 100)."),
};

export const getCollectionStatsShape = {};

export const getCollectionSnapshotShape = {
  recentLogsPerBottle: z.number().int().min(0).max(20).optional()
    .describe("Recent wear logs to include per bottle (default 5)."),
};
