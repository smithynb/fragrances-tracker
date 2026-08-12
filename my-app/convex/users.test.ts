import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupTest } from "./test.setup";

describe("currentUser", () => {
  test("returns null without an authenticated user", async () => {
    const t = setupTest();

    expect(await t.query(api.users.currentUser)).toBeNull();
  });

  test("returns only the public profile fields", async () => {
    const t = setupTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+15555550123",
      });
    });
    const asUser = t.withIdentity({ subject: `${userId}|testSession` });

    const result = await asUser.query(api.users.currentUser);

    expect(result).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("_creationTime");
  });
});
