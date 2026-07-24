// src/app/api/[transport]/route.ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import { verifyMcpToken, McpExtra } from "@/lib/mcp/verify-token";
import * as shapes from "@/lib/mcp/tool-schemas";

function convexFor(extra: McpExtra): ConvexHttpClient {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(extra.convexToken);
  return convex;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const d = data as { message?: string; kind?: string; retryAfter?: number };
      if (d.kind === "RateLimited" && typeof d.retryAfter === "number") {
        return `Rate limited. Retry after ${Math.ceil(d.retryAfter / 1000)}s.`;
      }
      if (d.message) return d.message;
    }
    return "Request rejected.";
  }
  if (error instanceof Error) {
    // Convex wraps thrown Error messages with call metadata; keep the useful tail.
    const match = error.message.match(/Uncaught Error: (.*?)(\n|$)/);
    return match ? match[1] : error.message;
  }
  return "Unknown error.";
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: errorMessage(error) }] };
  }
}

const handler = createMcpHandler(
  (server) => {
    const extraOf = (authInfo: unknown) =>
      (authInfo as { extra: McpExtra }).extra;

    // ── Bottles ───────────────────────────────────────────────────────────
    server.registerTool(
      "list_fragrances",
      { description: "List every fragrance (perfume/cologne) bottle in the user's collection, newest first. Start here to get bottle IDs.", inputSchema: shapes.listBottlesShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.bottles.listBottles, {})),
    );
    server.registerTool(
      "get_fragrance",
      { description: "Get one fragrance bottle from the user's collection by ID. Returns null if it doesn't exist or isn't the user's.", inputSchema: shapes.getBottleShape },
      async (args, { authInfo }) =>
        // IDs arrive as opaque strings from the zod shapes; Convex's arg types
        // want branded Ids. Cast at the boundary — v.id() stays authoritative.
        run(() =>
          convexFor(extraOf(authInfo)).query(
            api.bottles.getBottle,
            args as FunctionArgs<typeof api.bottles.getBottle>,
          ),
        ),
    );
    server.registerTool(
      "add_fragrance",
      { description: "Add a fragrance (perfume/cologne) bottle to the user's collection. Returns the new bottle ID.", inputSchema: shapes.addBottleShape },
      async (args, { authInfo }) =>
        run(async () => ({
          bottleId: await convexFor(extraOf(authInfo)).mutation(api.bottles.addBottle, args),
        })),
    );
    server.registerTool(
      "update_fragrance",
      { description: "Update a fragrance bottle in the user's collection. Omit a field to leave it unchanged; pass null to clear it (name cannot be cleared).", inputSchema: shapes.updateBottleShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.bottles.updateBottle,
            args as FunctionArgs<typeof api.bottles.updateBottle>,
          ),
        ),
    );
    server.registerTool(
      "delete_fragrance",
      { description: "Delete a fragrance bottle AND all of its wear logs (cascade). Irreversible — confirm with the user first.", inputSchema: shapes.deleteBottleShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.bottles.deleteBottle,
            args as FunctionArgs<typeof api.bottles.deleteBottle>,
          ),
        ),
    );
    server.registerTool(
      "toggle_favorite_fragrance",
      { description: "Toggle the favorite flag on a fragrance bottle in the user's collection.", inputSchema: shapes.toggleFavoriteShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.bottles.toggleFavorite,
            args as FunctionArgs<typeof api.bottles.toggleFavorite>,
          ),
        ),
    );

    // ── Wear logs ─────────────────────────────────────────────────────────
    server.registerTool(
      "log_fragrance_wear",
      { description: "Log that the user wore a fragrance (SOTD / scent of the day). wornAt is epoch milliseconds and must not be in the future.", inputSchema: shapes.addWearLogShape },
      async (args, { authInfo }) =>
        run(async () => ({
          wearLogId: await convexFor(extraOf(authInfo)).mutation(
            api.wearLogs.addWearLog,
            args as FunctionArgs<typeof api.wearLogs.addWearLog>,
          ),
        })),
    );
    server.registerTool(
      "update_fragrance_wear",
      { description: "Update a fragrance wear log. Omit a field to keep it; pass null to clear context/rating/comment.", inputSchema: shapes.updateWearLogShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.wearLogs.updateWearLog,
            args as FunctionArgs<typeof api.wearLogs.updateWearLog>,
          ),
        ),
    );
    server.registerTool(
      "delete_fragrance_wear",
      { description: "Delete a single fragrance wear log.", inputSchema: shapes.deleteWearLogShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.wearLogs.deleteWearLog,
            args as FunctionArgs<typeof api.wearLogs.deleteWearLog>,
          ),
        ),
    );

    // ── Insights ──────────────────────────────────────────────────────────
    server.registerTool(
      "list_fragrance_wears",
      { description: "List the user's fragrance wear history newest-first, optionally filtered by bottle and/or time range (epoch ms). Default limit 100, max 500.", inputSchema: shapes.listWearLogsShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).query(
            api.insights.listWearLogsFiltered,
            args as FunctionArgs<typeof api.insights.listWearLogsFiltered>,
          ),
        ),
    );
    server.registerTool(
      "get_fragrance_stats",
      { description: "Fragrance collection stats: per-bottle wears, sprays, avgRating, lastWornAt, plus totals (most/least worn perfumes, favorites, unworn count). Ideal first call for analysis.", inputSchema: shapes.getCollectionStatsShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionStats, {})),
    );
    server.registerTool(
      "get_fragrance_collection",
      { description: "Compact full export of the user's fragrance collection: every perfume/cologne bottle with stats, tags, notes, and N recent wear logs each. Built for one-shot analysis (rotation gaps, seasonal scent patterns, recommendations).", inputSchema: shapes.getCollectionSnapshotShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionSnapshot, args)),
    );
  },
  {
    serverInfo: { name: "fragrance-tracker", version: "1.0.0" },
    instructions:
      "Fragrance Tracker manages the user's personal fragrance (perfume/cologne) collection and wear history. " +
      "Use these tools FIRST whenever the user mentions fragrances, perfumes, colognes, scents, their collection, " +
      "what they wore or should wear (SOTD, scent of the day), wear logging, or fragrance stats — before web search " +
      "or general knowledge. All data is user-specific and exists only in this server. " +
      "Typical flow: get_fragrance_stats or list_fragrances first to get bottle IDs, then detail/mutation tools.",
  },
  { basePath: "/api", maxDuration: 60 },
);

const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST };
