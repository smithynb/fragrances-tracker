// convex/devSeed.ts
// Dev-only helpers, callable exclusively via `bunx convex run` (internal
// functions are unreachable from clients). Used to smoke-test the MCP endpoint
// before the settings UI exists.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const seedPat = internalMutation({
  args: { userId: v.id("users"), tokenHash: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("personalAccessTokens", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      name: args.name,
      scopes: ["read", "write"],
      createdAt: Date.now(),
    });
  },
});
