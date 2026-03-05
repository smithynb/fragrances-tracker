import { MutationCtx, QueryCtx } from "./_generated/server";

// In dev, set the CONVEX_DEV_USER_ID environment variable to simulate a
// specific user and avoid accidental cross-user data mixing across sessions.
// Configure it via the Convex dashboard or: npx convex env set CONVEX_DEV_USER_ID your-id
const DEV_USER_ID = process.env.CONVEX_DEV_USER_ID ?? "dev";

/**
 * Returns the current user's ID.
 * Swap this out for real auth later — e.g.:
 *   const identity = await ctx.auth.getUserIdentity();
 *   if (!identity) throw new Error("Unauthenticated");
 *   return identity.subject;
 */
export async function getUserId(_ctx: QueryCtx | MutationCtx): Promise<string> {
  return DEV_USER_ID;
}
