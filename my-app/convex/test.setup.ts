/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

export function setupTest() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

export async function createTestUser(
  t: ReturnType<typeof convexTest>,
  name?: string,
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name });
  });
  const as = t.withIdentity({ subject: `${userId}|testSession` });
  return { userId, as };
}
