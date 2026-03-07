import { MutationCtx, QueryCtx } from "./_generated/server";

export async function getUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity?.subject) {
    throw new Error(
      "Unauthenticated. Sign in and ensure the Clerk `convex` JWT template is configured."
    );
  }

  return identity.subject;
}
