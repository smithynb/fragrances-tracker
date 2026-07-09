// convex/apiTokens.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";

type T = ReturnType<typeof setupTest>;

describe("apiTokens", () => {
  let t: T;
  beforeEach(() => {
    t = setupTest();
  });

  test("create + validate round-trip", async () => {
    const { userId, as } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-1", name: "CLI" });
    const result = await t.mutation(api.apiTokens.validate, { tokenHash: "hash-1" });
    expect(result).toEqual({ userId, tokenId, scopes: ["read", "write"] });
  });

  test("validate returns null for unknown hashes", async () => {
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "nope" })).toBeNull();
  });

  test("revoked tokens stop validating and drop out of list", async () => {
    const { as } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-2", name: "CLI" });
    await as.mutation(api.apiTokens.revoke, { tokenId });
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "hash-2" })).toBeNull();
    expect(await as.query(api.apiTokens.list, {})).toHaveLength(0);
  });

  test("expired tokens stop validating", async () => {
    const { as } = await createTestUser(t);
    await as.mutation(api.apiTokens.create, {
      tokenHash: "hash-3",
      name: "short",
      expiresAt: Date.now() - 1,
    });
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "hash-3" })).toBeNull();
  });

  test("revoke rejects tokens owned by another user", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-4", name: "CLI" });
    await expect(asOther.mutation(api.apiTokens.revoke, { tokenId })).rejects.toThrow();
  });

  test("list shows only the caller's active tokens", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    await as.mutation(api.apiTokens.create, { tokenHash: "hash-5", name: "mine" });
    await asOther.mutation(api.apiTokens.create, { tokenHash: "hash-6", name: "theirs" });
    const mine = await as.query(api.apiTokens.list, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("mine");
  });

  test("create is rate limited per user", async () => {
    const { as } = await createTestUser(t);
    // createApiToken: burst capacity 3.
    for (let i = 0; i < 3; i++) {
      await as.mutation(api.apiTokens.create, { tokenHash: `burst-${i}`, name: `t${i}` });
    }
    await expect(
      as.mutation(api.apiTokens.create, { tokenHash: "burst-overflow", name: "overflow" }),
    ).rejects.toThrow();
  });
});
