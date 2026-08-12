import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const currentUser = query({
  args: {},
  returns: v.union(
    v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (user === null) {
      return null;
    }

    const profile: { name?: string; email?: string } = {};
    if (user.name !== undefined) {
      profile.name = user.name;
    }
    if (user.email !== undefined) {
      profile.email = user.email;
    }
    return profile;
  },
});
