import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { setupTest, createTestUser } from "./test.setup";

// ── P0: Auth enforcement ────────────────────────────────────────────────────

describe("unauthenticated access", () => {
  test("listBottles returns empty array", async () => {
    const t = setupTest();
    const result = await t.query(api.bottles.listBottles);
    expect(result).toEqual([]);
  });

  test("getBottle returns null", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    // Query without identity
    const result = await t.query(api.bottles.getBottle, { bottleId });
    expect(result).toBeNull();
  });

  test("addBottle throws", async () => {
    const t = setupTest();
    await expect(
      t.mutation(api.bottles.addBottle, { name: "Test" }),
    ).rejects.toThrowError("Unauthenticated.");
  });

  test("updateBottle throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      t.mutation(api.bottles.updateBottle, { bottleId, name: "New" }),
    ).rejects.toThrowError("Unauthenticated.");
  });

  test("deleteBottle throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      t.mutation(api.bottles.deleteBottle, { bottleId }),
    ).rejects.toThrowError("Unauthenticated.");
  });
});

// ── P0: Ownership isolation ─────────────────────────────────────────────────

describe("ownership isolation", () => {
  test("listBottles only returns own bottles", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    await alice.as.mutation(api.bottles.addBottle, { name: "Alice Bottle" });
    await bob.as.mutation(api.bottles.addBottle, { name: "Bob Bottle" });

    const aliceBottles = await alice.as.query(api.bottles.listBottles);
    expect(aliceBottles).toHaveLength(1);
    expect(aliceBottles[0].name).toBe("Alice Bottle");

    const bobBottles = await bob.as.query(api.bottles.listBottles);
    expect(bobBottles).toHaveLength(1);
    expect(bobBottles[0].name).toBe("Bob Bottle");
  });

  test("getBottle returns null for another user's bottle", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const bottleId = await alice.as.mutation(api.bottles.addBottle, {
      name: "Alice Only",
    });

    const result = await bob.as.query(api.bottles.getBottle, { bottleId });
    expect(result).toBeNull();
  });

  test("updateBottle throws for another user's bottle", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const bottleId = await alice.as.mutation(api.bottles.addBottle, {
      name: "Alice Only",
    });

    await expect(
      bob.as.mutation(api.bottles.updateBottle, {
        bottleId,
        name: "Hijacked",
      }),
    ).rejects.toThrowError("Bottle not found or access denied.");
  });

  test("deleteBottle throws for another user's bottle", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const bottleId = await alice.as.mutation(api.bottles.addBottle, {
      name: "Alice Only",
    });

    await expect(
      bob.as.mutation(api.bottles.deleteBottle, { bottleId }),
    ).rejects.toThrowError("Bottle not found or access denied.");
  });
});

// ── P1: CRUD happy paths ────────────────────────────────────────────────────

describe("addBottle", () => {
  test("creates a bottle with required fields only", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Santal 33",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle).not.toBeNull();
    expect(bottle!.name).toBe("Santal 33");
    expect(bottle!.userId).toBe(user.userId);
    expect(bottle!.createdAt).toBeTypeOf("number");
    expect(bottle!.brand).toBeUndefined();
    expect(bottle!.sizeMl).toBeUndefined();
    expect(bottle!.tags).toBeUndefined();
    expect(bottle!.comments).toBeUndefined();
    expect(bottle!.updatedAt).toBeUndefined();
  });

  test("creates a bottle with all fields", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
      brand: "Creed",
      sizeMl: 100,
      tags: ["niche", "compliment getter"],
      comments: "Great projection",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.name).toBe("Aventus");
    expect(bottle!.brand).toBe("Creed");
    expect(bottle!.sizeMl).toBe(100);
    expect(bottle!.tags).toEqual(["niche", "compliment getter"]);
    expect(bottle!.comments).toBe("Great projection");
  });
});

describe("listBottles", () => {
  test("returns bottles in descending creation order", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const id1 = await user.as.mutation(api.bottles.addBottle, {
      name: "First",
    });
    const id2 = await user.as.mutation(api.bottles.addBottle, {
      name: "Second",
    });
    const id3 = await user.as.mutation(api.bottles.addBottle, {
      name: "Third",
    });

    const bottles = await user.as.query(api.bottles.listBottles);
    expect(bottles).toHaveLength(3);
    // Desc order by _creationTime (most recent first)
    expect(bottles[0]._id).toBe(id3);
    expect(bottles[1]._id).toBe(id2);
    expect(bottles[2]._id).toBe(id1);
  });

  test("returns empty array when user has no bottles", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottles = await user.as.query(api.bottles.listBottles);
    expect(bottles).toEqual([]);
  });
});

describe("getBottle", () => {
  test("returns the correct bottle by ID", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Bleu de Chanel",
      brand: "Chanel",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle).not.toBeNull();
    expect(bottle!._id).toBe(bottleId);
    expect(bottle!.name).toBe("Bleu de Chanel");
    expect(bottle!.brand).toBe("Chanel");
  });
});

describe("updateBottle", () => {
  test("updates name and sets updatedAt", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Old Name",
      brand: "Brand",
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      name: "New Name",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.name).toBe("New Name");
    expect(bottle!.brand).toBe("Brand"); // unchanged
    expect(bottle!.updatedAt).toBeTypeOf("number");
  });
});

describe("deleteBottle", () => {
  test("removes the bottle", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Doomed",
    });

    await user.as.mutation(api.bottles.deleteBottle, { bottleId });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle).toBeNull();
  });
});

// ── P1: Cascade delete ──────────────────────────────────────────────────────

describe("cascade delete", () => {
  test("deleteBottle removes all associated wear logs", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
    });

    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 3,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 2,
    });

    await user.as.mutation(api.bottles.deleteBottle, { bottleId });

    // Verify via direct DB access
    const remainingLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("wearLogs")
        .withIndex("by_bottle", (q) => q.eq("bottleId", bottleId))
        .collect();
    });
    expect(remainingLogs).toHaveLength(0);
  });

  test("deleteBottle does NOT remove other bottles' wear logs", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleA = await user.as.mutation(api.bottles.addBottle, {
      name: "Bottle A",
    });
    const bottleB = await user.as.mutation(api.bottles.addBottle, {
      name: "Bottle B",
    });

    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 1,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleB,
      wornAt: Date.now(),
      sprays: 2,
    });

    await user.as.mutation(api.bottles.deleteBottle, { bottleId: bottleA });

    const bottleBLogs = await user.as.query(api.wearLogs.listWearLogsByBottle, {
      bottleId: bottleB,
    });
    expect(bottleBLogs).toHaveLength(1);
    expect(bottleBLogs[0].sprays).toBe(2);
  });
});

// ── P2: Null/undefined update semantics ─────────────────────────────────────

describe("update semantics (null clears, undefined preserves)", () => {
  test("undefined brand preserves existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      brand: "Dior",
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      name: "Updated",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.brand).toBe("Dior");
  });

  test("null brand clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      brand: "Dior",
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      brand: null,
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.brand).toBeUndefined();
  });

  test("value updates brand", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      brand: "Dior",
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      brand: "Chanel",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.brand).toBe("Chanel");
  });

  test("null sizeMl clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 100,
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      sizeMl: null,
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.sizeMl).toBeUndefined();
  });

  test("null tags clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      tags: ["niche"],
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      tags: null,
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.tags).toBeUndefined();
  });

  test("null comments clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      comments: "Great scent",
    });

    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      comments: null,
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.comments).toBeUndefined();
  });
});

// ── P2: Validation boundaries ───────────────────────────────────────────────

describe("validation", () => {
  test("name at 200 chars is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const name = "a".repeat(200);
    const bottleId = await user.as.mutation(api.bottles.addBottle, { name });
    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.name).toBe(name);
  });

  test("name at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, { name: "a".repeat(201) }),
    ).rejects.toThrowError("Name must be at most 200 characters.");
  });

  test("brand at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        brand: "b".repeat(201),
      }),
    ).rejects.toThrowError("Brand must be at most 200 characters.");
  });

  test("comments at 2001 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        comments: "c".repeat(2001),
      }),
    ).rejects.toThrowError("Comments must be at most 2000 characters.");
  });

  test("21 tags is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
      }),
    ).rejects.toThrowError("You can add at most 20 tags.");
  });

  test("20 tags is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      tags,
    });
    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.tags).toEqual(tags);
  });

  test("tag at 51 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        tags: ["t".repeat(51)],
      }),
    ).rejects.toThrowError("Each tag must be at most 50 characters.");
  });

  test("sizeMl of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        sizeMl: 0,
      }),
    ).rejects.toThrowError("sizeMl must be greater than 0.");
  });

  test("negative sizeMl is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        sizeMl: -5,
      }),
    ).rejects.toThrowError("sizeMl must be greater than 0.");
  });

  test("sizeMl of 10000 is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 10000,
    });
    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.sizeMl).toBe(10000);
  });

  test("sizeMl of 10001 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        sizeMl: 10001,
      }),
    ).rejects.toThrowError("Size must be at most 10000 mL.");
  });
});

// ── P2: updateBottle validation ──────────────────────────────────────────────

describe("updateBottle validation", () => {
  test("name at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, {
        bottleId,
        name: "a".repeat(201),
      }),
    ).rejects.toThrowError("Name must be at most 200 characters.");
  });

  test("brand at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, {
        bottleId,
        brand: "b".repeat(201),
      }),
    ).rejects.toThrowError("Brand must be at most 200 characters.");
  });

  test("sizeMl of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 100,
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, { bottleId, sizeMl: 0 }),
    ).rejects.toThrowError("sizeMl must be greater than 0.");
  });

  test("negative sizeMl is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 100,
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, { bottleId, sizeMl: -1 }),
    ).rejects.toThrowError("sizeMl must be greater than 0.");
  });

  test("null sizeMl does not trigger the >0 validation guard", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 100,
    });
    // null means "clear the field" — should not be treated as 0 or negative
    await user.as.mutation(api.bottles.updateBottle, {
      bottleId,
      sizeMl: null,
    });
    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.sizeMl).toBeUndefined();
  });

  test("comments at 2001 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, {
        bottleId,
        comments: "c".repeat(2001),
      }),
    ).rejects.toThrowError("Comments must be at most 2000 characters.");
  });
});
