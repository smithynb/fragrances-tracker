import { expect, test, describe, vi } from "vitest";
import { api } from "./_generated/api";
import { setupTest, createTestUser } from "./test.setup";

/** Helper: create a bottle for the given user and return its ID. */
async function addBottle(
  as: Awaited<ReturnType<typeof createTestUser>>["as"],
  name = "Test Bottle",
) {
  return as.mutation(api.bottles.addBottle, { name });
}

// ── P0: Auth enforcement ────────────────────────────────────────────────────

describe("unauthenticated access", () => {
  test("listWearLogs returns empty array", async () => {
    const t = setupTest();
    expect(await t.query(api.wearLogs.listWearLogs)).toEqual([]);
  });

  test("listWearLogsByBottle returns empty array", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    expect(
      await t.query(api.wearLogs.listWearLogsByBottle, { bottleId }),
    ).toEqual([]);
  });

  test("listBottleStats returns empty object", async () => {
    const t = setupTest();
    expect(await t.query(api.wearLogs.listBottleStats)).toEqual({});
  });

  test("getWearLog returns null", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    expect(await t.query(api.wearLogs.getWearLog, { wearLogId: logId })).toBeNull();
  });

  test("addWearLog throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      t.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
      }),
    ).rejects.toThrowError("Unauthenticated.");
  });

  test("updateWearLog throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      t.mutation(api.wearLogs.updateWearLog, { wearLogId: logId, sprays: 2 }),
    ).rejects.toThrowError("Unauthenticated.");
  });

  test("deleteWearLog throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      t.mutation(api.wearLogs.deleteWearLog, { wearLogId: logId }),
    ).rejects.toThrowError("Unauthenticated.");
  });
});

// ── P0: Ownership isolation ─────────────────────────────────────────────────

describe("ownership isolation", () => {
  test("listWearLogs only returns own logs", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as, "Alice Bottle");
    const bobBottle = await addBottle(bob.as, "Bob Bottle");

    await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 3,
    });
    await bob.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bobBottle,
      wornAt: Date.now(),
      sprays: 5,
    });

    const aliceLogs = await alice.as.query(api.wearLogs.listWearLogs);
    expect(aliceLogs).toHaveLength(1);
    expect(aliceLogs[0].sprays).toBe(3);

    const bobLogs = await bob.as.query(api.wearLogs.listWearLogs);
    expect(bobLogs).toHaveLength(1);
    expect(bobLogs[0].sprays).toBe(5);
  });

  test("listWearLogsByBottle only returns own logs", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as, "Alice Bottle");
    await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 3,
    });

    // Bob queries Alice's bottleId — should get nothing due to index filtering
    const result = await bob.as.query(api.wearLogs.listWearLogsByBottle, {
      bottleId: aliceBottle,
    });
    expect(result).toEqual([]);
  });

  test("listBottleStats only returns stats for own bottles", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as, "Alice Bottle");
    await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 5,
    });

    const bobStats = await bob.as.query(api.wearLogs.listBottleStats);
    expect(bobStats).toEqual({});

    const aliceStats = await alice.as.query(api.wearLogs.listBottleStats);
    expect(Object.keys(aliceStats)).toHaveLength(1);
  });

  test("getWearLog returns null for another user's log", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as);
    const logId = await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 1,
    });

    expect(
      await bob.as.query(api.wearLogs.getWearLog, { wearLogId: logId }),
    ).toBeNull();
  });

  test("updateWearLog throws for another user's log", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as);
    const logId = await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 1,
    });

    await expect(
      bob.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        sprays: 99,
      }),
    ).rejects.toThrowError("Wear log not found or access denied.");
  });

  test("deleteWearLog throws for another user's log", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as);
    const logId = await alice.as.mutation(api.wearLogs.addWearLog, {
      bottleId: aliceBottle,
      wornAt: Date.now(),
      sprays: 1,
    });

    await expect(
      bob.as.mutation(api.wearLogs.deleteWearLog, { wearLogId: logId }),
    ).rejects.toThrowError("Wear log not found or access denied.");
  });
});

// ── P0: Cross-table integrity ───────────────────────────────────────────────

describe("cross-table integrity", () => {
  test("addWearLog for another user's bottle throws", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");

    const aliceBottle = await addBottle(alice.as);

    await expect(
      bob.as.mutation(api.wearLogs.addWearLog, {
        bottleId: aliceBottle,
        wornAt: Date.now(),
        sprays: 1,
      }),
    ).rejects.toThrowError("Bottle not found or access denied.");
  });

  test("addWearLog for deleted bottle throws", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await user.as.mutation(api.bottles.deleteBottle, { bottleId });

    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
      }),
    ).rejects.toThrowError("Bottle not found or access denied.");
  });
});

// ── P1: CRUD happy paths ────────────────────────────────────────────────────

describe("addWearLog", () => {
  test("creates a wear log with all fields", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const now = Date.now();

    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: now,
      sprays: 4,
      context: "Office",
      rating: 8,
      comment: "Lasted all day",
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log).not.toBeNull();
    expect(log!.bottleId).toBe(bottleId);
    expect(log!.userId).toBe(user.userId);
    expect(log!.wornAt).toBe(now);
    expect(log!.sprays).toBe(4);
    expect(log!.context).toBe("Office");
    expect(log!.rating).toBe(8);
    expect(log!.comment).toBe("Lasted all day");
  });

  test("creates a wear log with required fields only", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);

    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 2,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.context).toBeUndefined();
    expect(log!.rating).toBeUndefined();
    expect(log!.comment).toBeUndefined();
  });
});

describe("listWearLogs", () => {
  test("returns logs in descending wornAt order", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);

    // Insert out of wornAt order so _creationTime ≠ wornAt order.
    const idMiddle = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: 2000,
      sprays: 2,
    });
    const idLatest = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: 3000,
      sprays: 3,
    });
    const idEarliest = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: 1000,
      sprays: 1,
    });

    const logs = await user.as.query(api.wearLogs.listWearLogs);
    expect(logs).toHaveLength(3);
    // Desc by wornAt, NOT by _creationTime
    expect(logs[0]._id).toBe(idLatest);
    expect(logs[1]._id).toBe(idMiddle);
    expect(logs[2]._id).toBe(idEarliest);
  });
});

describe("listWearLogsByBottle", () => {
  test("filters logs by bottle", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleA = await addBottle(user.as, "A");
    const bottleB = await addBottle(user.as, "B");

    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 1,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 2,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleB,
      wornAt: Date.now(),
      sprays: 5,
    });

    const logsA = await user.as.query(api.wearLogs.listWearLogsByBottle, {
      bottleId: bottleA,
    });
    expect(logsA).toHaveLength(2);

    const logsB = await user.as.query(api.wearLogs.listWearLogsByBottle, {
      bottleId: bottleB,
    });
    expect(logsB).toHaveLength(1);
    expect(logsB[0].sprays).toBe(5);
  });
});

describe("getWearLog", () => {
  test("returns the correct log by ID", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: 12345,
      sprays: 7,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!._id).toBe(logId);
    expect(log!.wornAt).toBe(12345);
    expect(log!.sprays).toBe(7);
  });
});

describe("deleteWearLog", () => {
  test("removes the log", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });

    await user.as.mutation(api.wearLogs.deleteWearLog, { wearLogId: logId });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log).toBeNull();
  });
});

// ── P1: Stats aggregation ───────────────────────────────────────────────────

describe("listBottleStats", () => {
  test("aggregates wears and sprays per bottle", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleA = await addBottle(user.as, "A");
    const bottleB = await addBottle(user.as, "B");

    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 3,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 5,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleB,
      wornAt: Date.now(),
      sprays: 2,
    });

    const stats = await user.as.query(api.wearLogs.listBottleStats);
    expect(stats[bottleA]).toEqual({ wears: 2, sprays: 8, avgRating: null });
    expect(stats[bottleB]).toEqual({ wears: 1, sprays: 2, avgRating: null });
  });

  test("aggregates average rating from rated logs only", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleA = await addBottle(user.as, "A");
    const bottleB = await addBottle(user.as, "B");

    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 3,
      rating: 8,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 4,
      rating: 6,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleA,
      wornAt: Date.now(),
      sprays: 2,
    });
    await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId: bottleB,
      wornAt: Date.now(),
      sprays: 1,
    });

    const stats = await user.as.query(api.wearLogs.listBottleStats);
    expect(stats[bottleA]).toEqual({ wears: 3, sprays: 9, avgRating: 7 });
    expect(stats[bottleB]).toEqual({ wears: 1, sprays: 1, avgRating: null });
  });

  test("returns empty after all logs deleted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });

    await user.as.mutation(api.wearLogs.deleteWearLog, { wearLogId: logId });

    const stats = await user.as.query(api.wearLogs.listBottleStats);
    expect(stats).toEqual({});
  });
});

// ── P2: Null/undefined update semantics ─────────────────────────────────────

describe("update semantics (null clears, undefined preserves)", () => {
  test("undefined context preserves existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      context: "Office",
    });

    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      sprays: 2,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.context).toBe("Office");
    expect(log!.sprays).toBe(2);
  });

  test("null context clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      context: "Office",
    });

    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      context: null,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.context).toBeUndefined();
  });

  test("null rating clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      rating: 8,
    });

    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      rating: null,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.rating).toBeUndefined();
  });

  test("null comment clears existing value", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      comment: "Great scent",
    });

    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      comment: null,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.comment).toBeUndefined();
  });

  test("value updates rating", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      rating: 5,
    });

    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      rating: 9,
    });

    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.rating).toBe(9);
  });
});

// ── P2: Validation boundaries ───────────────────────────────────────────────

describe("validation", () => {
  test("sprays of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 0,
      }),
    ).rejects.toThrowError("sprays must be a whole number of at least 1.");
  });

  test("sprays of 1 is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.sprays).toBe(1);
  });

  test("sprays of 100 is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 100,
    });
    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.sprays).toBe(100);
  });

  test("sprays of 101 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 101,
      }),
    ).rejects.toThrowError("sprays must be at most 100.");
  });

  test("non-integer sprays is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1.5,
      }),
    ).rejects.toThrowError("sprays must be a whole number of at least 1.");
  });

  test("rating of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
        rating: 0,
      }),
    ).rejects.toThrowError("rating must be between 1 and 10 inclusive.");
  });

  test("rating of 1 is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      rating: 1,
    });
    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.rating).toBe(1);
  });

  test("rating of 10 is accepted", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      rating: 10,
    });
    const log = await user.as.query(api.wearLogs.getWearLog, {
      wearLogId: logId,
    });
    expect(log!.rating).toBe(10);
  });

  test("rating of 11 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
        rating: 11,
      }),
    ).rejects.toThrowError("rating must be between 1 and 10 inclusive.");
  });

  test("wornAt of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: 0,
        sprays: 1,
      }),
    ).rejects.toThrowError("wornAt must be a positive Unix timestamp (ms).");
  });

  test("negative wornAt is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: -100,
        sprays: 1,
      }),
    ).rejects.toThrowError("wornAt must be a positive Unix timestamp (ms).");
  });

  test("comment at 2001 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
        comment: "c".repeat(2001),
      }),
    ).rejects.toThrowError("Comment must be at most 2000 characters.");
  });

  test("context at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    await expect(
      user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: Date.now(),
        sprays: 1,
        context: "x".repeat(201),
      }),
    ).rejects.toThrowError("Context must be at most 200 characters.");
  });

  test("wornAt beyond the future tolerance is rejected", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = setupTest();
      const user = await createTestUser(t);
      const bottleId = await addBottle(user.as);
      await expect(
        user.as.mutation(api.wearLogs.addWearLog, {
          bottleId,
          wornAt: now + 60_001,
          sprays: 1,
        }),
      ).rejects.toThrowError("wornAt cannot be in the future.");
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("wornAt within the future tolerance is accepted", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = setupTest();
      const user = await createTestUser(t);
      const bottleId = await addBottle(user.as);
      const logId = await user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: now + 60_000,
        sprays: 1,
      });

      const log = await user.as.query(api.wearLogs.getWearLog, {
        wearLogId: logId,
      });
      expect(log!.wornAt).toBe(now + 60_000);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

// ── P2: updateWearLog validation ─────────────────────────────────────────────

describe("updateWearLog validation", () => {
  test("sprays of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, { wearLogId: logId, sprays: 0 }),
    ).rejects.toThrowError("sprays must be a whole number of at least 1.");
  });

  test("sprays of 101 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        sprays: 101,
      }),
    ).rejects.toThrowError("sprays must be at most 100.");
  });

  test("non-integer sprays is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        sprays: 2.5,
      }),
    ).rejects.toThrowError("sprays must be a whole number of at least 1.");
  });

  test("rating of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        rating: 0,
      }),
    ).rejects.toThrowError("rating must be between 1 and 10 inclusive.");
  });

  test("rating of 11 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        rating: 11,
      }),
    ).rejects.toThrowError("rating must be between 1 and 10 inclusive.");
  });

  test("null rating does not trigger range validation", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
      rating: 7,
    });
    // null means "clear the field" — should not be treated as 0
    await user.as.mutation(api.wearLogs.updateWearLog, {
      wearLogId: logId,
      rating: null,
    });
    const log = await user.as.query(api.wearLogs.getWearLog, { wearLogId: logId });
    expect(log!.rating).toBeUndefined();
  });

  test("comment at 2001 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        comment: "c".repeat(2001),
      }),
    ).rejects.toThrowError("Comment must be at most 2000 characters.");
  });

  test("context at 201 chars is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        context: "x".repeat(201),
      }),
    ).rejects.toThrowError("Context must be at most 200 characters.");
  });

  test("wornAt of 0 is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await addBottle(user.as);
    const logId = await user.as.mutation(api.wearLogs.addWearLog, {
      bottleId,
      wornAt: Date.now(),
      sprays: 1,
    });
    await expect(
      user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        wornAt: 0,
      }),
    ).rejects.toThrowError("wornAt must be a positive Unix timestamp (ms).");
  });

  test("wornAt beyond the future tolerance is rejected", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = setupTest();
      const user = await createTestUser(t);
      const bottleId = await addBottle(user.as);
      const logId = await user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: now,
        sprays: 1,
      });

      await expect(
        user.as.mutation(api.wearLogs.updateWearLog, {
          wearLogId: logId,
          wornAt: now + 60_001,
        }),
      ).rejects.toThrowError("wornAt cannot be in the future.");
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("wornAt within the future tolerance is accepted", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = setupTest();
      const user = await createTestUser(t);
      const bottleId = await addBottle(user.as);
      const logId = await user.as.mutation(api.wearLogs.addWearLog, {
        bottleId,
        wornAt: now,
        sprays: 1,
      });

      await user.as.mutation(api.wearLogs.updateWearLog, {
        wearLogId: logId,
        wornAt: now + 60_000,
      });

      const log = await user.as.query(api.wearLogs.getWearLog, {
        wearLogId: logId,
      });
      expect(log!.wornAt).toBe(now + 60_000);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
