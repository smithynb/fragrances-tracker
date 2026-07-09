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
      "list_bottles",
      { description: "List every fragrance bottle in the user's collection, newest first. Start here to get bottle IDs.", inputSchema: shapes.listBottlesShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.bottles.listBottles, {})),
    );
    server.registerTool(
      "get_bottle",
      { description: "Get one bottle by ID. Returns null if it doesn't exist or isn't the user's.", inputSchema: shapes.getBottleShape },
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
      "add_bottle",
      { description: "Add a fragrance bottle to the user's collection. Returns the new bottle ID.", inputSchema: shapes.addBottleShape },
      async (args, { authInfo }) =>
        run(async () => ({
          bottleId: await convexFor(extraOf(authInfo)).mutation(api.bottles.addBottle, args),
        })),
    );
    server.registerTool(
      "update_bottle",
      { description: "Update a bottle. Omit a field to leave it unchanged; pass null to clear it (name cannot be cleared).", inputSchema: shapes.updateBottleShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.bottles.updateBottle,
            args as FunctionArgs<typeof api.bottles.updateBottle>,
          ),
        ),
    );
    server.registerTool(
      "delete_bottle",
      { description: "Delete a bottle AND all of its wear logs (cascade). Irreversible — confirm with the user first.", inputSchema: shapes.deleteBottleShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.bottles.deleteBottle,
            args as FunctionArgs<typeof api.bottles.deleteBottle>,
          ),
        ),
    );
    server.registerTool(
      "toggle_favorite",
      { description: "Toggle a bottle's favorite flag.", inputSchema: shapes.toggleFavoriteShape },
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
      "add_wear_log",
      { description: "Log a wear of a bottle. wornAt is epoch milliseconds and must not be in the future.", inputSchema: shapes.addWearLogShape },
      async (args, { authInfo }) =>
        run(async () => ({
          wearLogId: await convexFor(extraOf(authInfo)).mutation(
            api.wearLogs.addWearLog,
            args as FunctionArgs<typeof api.wearLogs.addWearLog>,
          ),
        })),
    );
    server.registerTool(
      "update_wear_log",
      { description: "Update a wear log. Omit a field to keep it; pass null to clear context/rating/comment.", inputSchema: shapes.updateWearLogShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).mutation(
            api.wearLogs.updateWearLog,
            args as FunctionArgs<typeof api.wearLogs.updateWearLog>,
          ),
        ),
    );
    server.registerTool(
      "delete_wear_log",
      { description: "Delete a single wear log.", inputSchema: shapes.deleteWearLogShape },
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
      "list_wear_logs",
      { description: "List wear logs newest-first, optionally filtered by bottle and/or time range (epoch ms). Default limit 100, max 500.", inputSchema: shapes.listWearLogsShape },
      async (args, { authInfo }) =>
        run(() =>
          convexFor(extraOf(authInfo)).query(
            api.insights.listWearLogsFiltered,
            args as FunctionArgs<typeof api.insights.listWearLogsFiltered>,
          ),
        ),
    );
    server.registerTool(
      "get_collection_stats",
      { description: "Per-bottle stats (wears, sprays, avgRating, lastWornAt) plus collection totals (most/least worn, favorites, unworn count). Ideal first call for analysis.", inputSchema: shapes.getCollectionStatsShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionStats, {})),
    );
    server.registerTool(
      "get_collection_snapshot",
      { description: "Compact full export: every bottle with stats, tags, notes, and N recent wear logs each. Built for one-shot analysis (rotation gaps, seasonal patterns, recommendations).", inputSchema: shapes.getCollectionSnapshotShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionSnapshot, args)),
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST };
