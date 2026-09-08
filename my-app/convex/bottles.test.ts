import { expect, test, describe, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
    await expect(t.mutation(api.bottles.addBottle, { name: "Test" })).rejects.toThrowError(
      "Unauthenticated.",
    );
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
    await expect(t.mutation(api.bottles.deleteBottle, { bottleId })).rejects.toThrowError(
      "Unauthenticated.",
    );
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

    await expect(bob.as.mutation(api.bottles.deleteBottle, { bottleId })).rejects.toThrowError(
      "Bottle not found or access denied.",
    );
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
  test("hides the bottle immediately", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Doomed",
    });

    vi.useFakeTimers();
    try {
      await user.as.mutation(api.bottles.deleteBottle, { bottleId });

      const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
      expect(bottle).toBeNull();
      expect(await user.as.query(api.bottles.listBottles)).toEqual([]);

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const completedDeletion = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        failedJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.state.kind === "failed",
        ),
      }));
      expect(completedDeletion.bottle).toBeNull();
      expect(completedDeletion.failedJobs).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("lets the owner find a failed tombstone and request the existing retry", async () => {
    const t = setupTest();
    const owner = await createTestUser(t, "Recovery owner");
    const otherUser = await createTestUser(t, "Other owner");
    const previousDeletingAt = 100;
    const bottleId = await t.run(async (ctx) =>
      ctx.db.insert("bottles", {
        userId: owner.userId,
        name: "Recoverable bottle",
        brand: "Private brand detail",
        comments: "Private comment detail",
        deletingAt: previousDeletingAt,
        cleanupStatus: "failed",
        cleanupAttempts: 4,
        cleanupLastError: "private operator detail",
        createdAt: previousDeletingAt,
      }),
    );

    const failures = await owner.as.query(api.bottles.listFailedBottleDeletions);
    expect(failures).toEqual([
      {
        _id: bottleId,
        name: "Recoverable bottle",
        cleanupStatus: "failed",
      },
    ]);
    expect(Object.keys(failures[0]).sort()).toEqual(["_id", "name", "cleanupStatus"].sort());
    expect(await otherUser.as.query(api.bottles.listFailedBottleDeletions)).toEqual([]);
    expect(await t.query(api.bottles.listFailedBottleDeletions)).toEqual([]);

    await owner.as.mutation(api.bottles.deleteBottle, { bottleId });
    const retried = await t.run(async (ctx) => ctx.db.get(bottleId));
    expect(retried?.deletingAt).toBeGreaterThan(previousDeletingAt);
    expect(retried?.cleanupStatus).toBe("pending");
    expect(retried?.cleanupAttempts).toBe(1);
    expect(retried?.cleanupJobId).toBeDefined();

    await t.run(async (ctx) => {
      await ctx.scheduler.cancel(retried!.cleanupJobId!);
    });
  });
});

// ── P1: Cascade delete ──────────────────────────────────────────────────────

describe("cascade delete", () => {
  test("keeps recovery coverage after observing an in-progress batch", async () => {
    const t = setupTest();
    const user = await createTestUser(t, "Successor owner");
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Successor failure",
    });
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert("wearLogs", {
          userId: user.userId,
          bottleId,
          wornAt: now - index,
          sprays: 1,
        });
      }
    });

    vi.useFakeTimers();
    try {
      await user.as.mutation(api.bottles.deleteBottle, { bottleId });

      const beforeFirstBatch = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      const initialBatch = beforeFirstBatch.jobs.find(
        (job) => job._id === beforeFirstBatch.bottle?.cleanupJobId,
      );
      const initialWatchdog = beforeFirstBatch.jobs.find((job) =>
        job.name.endsWith("watchBottleDeletion"),
      );
      const initialWatchdogId = initialWatchdog?._id;
      const deletionNonce = beforeFirstBatch.bottle!.deletingAt!;
      expect(initialBatch?.state.kind).toBe("pending");
      expect(initialWatchdogId).toBeDefined();

      // Start the real scheduled batch and assert that the harness observed
      // its actual in-progress scheduler state before it committed.
      vi.advanceTimersToNextTimer();
      const duringFirstBatch = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(duringFirstBatch.jobs.find((job) => job._id === initialBatch?._id)?.state.kind).toBe(
        "inProgress",
      );
      await t.finishInProgressScheduledFunctions();

      const afterFirstBatch = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      const successorBatch = afterFirstBatch.jobs.find(
        (job) => job._id === afterFirstBatch.bottle?.cleanupJobId,
      );
      const successorWatchdog = afterFirstBatch.jobs.find(
        (job) =>
          job.name.endsWith("watchBottleDeletion") &&
          job._id !== initialWatchdogId &&
          job.state.kind === "pending",
      );
      expect(successorBatch?.state.kind).toBe("pending");
      expect(successorWatchdog).toBeDefined();

      // Model the race where the watchdog saw active work before the batch
      // could commit its successor. Remove the old observations and make the
      // deadline due; the watchdog under test must leave a new bounded one.
      await t.run(async (ctx) => {
        await ctx.scheduler.cancel(initialWatchdogId!);
        await ctx.scheduler.cancel(successorWatchdog!._id);
        await ctx.db.patch(bottleId, { cleanupNextRetryAt: undefined });
      });
      await t.mutation(internal.bottles.watchBottleDeletion, {
        bottleId,
        expectedUserId: user.userId,
        expectedDeletingAt: deletionNonce,
      });
      // A duplicate observation while the claimed deadline is still future
      // must not add another watchdog.
      await t.mutation(internal.bottles.watchBottleDeletion, {
        bottleId,
        expectedUserId: user.userId,
        expectedDeletingAt: deletionNonce,
      });
      const afterActiveObservation = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(afterActiveObservation.bottle?.deletingAt).toBe(deletionNonce);
      expect(afterActiveObservation.bottle?.cleanupJobId).toBe(successorBatch?._id);
      expect(afterActiveObservation.bottle?.cleanupNextRetryAt).toBeTypeOf("number");
      expect(
        afterActiveObservation.jobs.filter(
          (job) => job.name.endsWith("watchBottleDeletion") && job.state.kind === "pending",
        ),
      ).toHaveLength(1);

      // The successor batch now fails/cancels. No later watchdog is invoked by
      // hand; the future observation created above must recover automatically.
      await t.run(async (ctx) => {
        await ctx.scheduler.cancel(successorBatch!._id);
      });
      vi.advanceTimersByTime(5 * 60 * 1000);
      await t.finishInProgressScheduledFunctions();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => ctx.db.get(bottleId))).toBeNull();
      expect(
        await t.run(async (ctx) =>
          ctx.db
            .query("wearLogs")
            .withIndex("by_bottle", (q) => q.eq("bottleId", bottleId))
            .collect(),
        ),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cleans more than two batches without touching another bottle or its logs", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const doomedBottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Doomed",
    });
    const retainedBottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Retained",
    });
    const now = Date.now();
    const { firstDoomedLogId, retainedLogId } = await t.run(async (ctx) => {
      let firstDoomedLogId = null;
      for (let index = 0; index < 205; index += 1) {
        const logId = await ctx.db.insert("wearLogs", {
          userId: user.userId,
          bottleId: doomedBottleId,
          wornAt: now - index,
          sprays: 1,
        });
        firstDoomedLogId ??= logId;
      }
      const retainedLogId = await ctx.db.insert("wearLogs", {
        userId: user.userId,
        bottleId: retainedBottleId,
        wornAt: now,
        sprays: 2,
      });
      return { firstDoomedLogId: firstDoomedLogId!, retainedLogId };
    });

    vi.useFakeTimers();
    try {
      expect(
        await user.as.mutation(api.bottles.deleteBottle, {
          bottleId: doomedBottleId,
        }),
      ).toBeNull();

      expect(await user.as.query(api.bottles.getBottle, { bottleId: doomedBottleId })).toBeNull();
      expect((await user.as.query(api.bottles.listBottles)).map((bottle) => bottle._id)).toEqual([
        retainedBottleId,
      ]);

      const pendingCleanup = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(doomedBottleId),
        logs: await ctx.db
          .query("wearLogs")
          .withIndex("by_bottle", (q) => q.eq("bottleId", doomedBottleId))
          .collect(),
        pendingJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.state.kind === "pending",
        ).length,
      }));
      expect(pendingCleanup.bottle?.deletingAt).toBeTypeOf("number");
      expect(pendingCleanup.bottle?.cleanupJobId).toBeDefined();
      expect(pendingCleanup.logs).toHaveLength(205);
      expect(
        await user.as.query(api.wearLogs.listWearLogsByBottle, {
          bottleId: doomedBottleId,
        }),
      ).toEqual([]);
      expect(
        await user.as.query(api.wearLogs.getWearLog, {
          wearLogId: firstDoomedLogId,
        }),
      ).toBeNull();
      const visibleLogs = await user.as.query(api.wearLogs.listWearLogs);
      expect(visibleLogs).toHaveLength(1);
      expect(visibleLogs[0]._id).toBe(retainedLogId);
      expect(await user.as.query(api.wearLogs.listBottleStats)).toEqual({
        [retainedBottleId]: { wears: 1, sprays: 2, avgRating: null },
      });

      await expect(
        user.as.mutation(api.bottles.updateBottle, {
          bottleId: doomedBottleId,
          name: "Too late",
        }),
      ).rejects.toThrowError("Bottle not found or access denied.");
      await expect(
        user.as.mutation(api.bottles.toggleFavorite, { bottleId: doomedBottleId }),
      ).rejects.toThrowError("Bottle not found or access denied.");
      await expect(
        user.as.mutation(api.wearLogs.addWearLog, {
          bottleId: doomedBottleId,
          wornAt: now,
          sprays: 1,
        }),
      ).rejects.toThrowError("Bottle not found or access denied.");
      await expect(
        user.as.mutation(api.wearLogs.updateWearLog, {
          wearLogId: firstDoomedLogId,
          sprays: 2,
        }),
      ).rejects.toThrowError("Bottle not found or access denied.");

      // Pending retries are true no-ops, including beyond the limiter's burst
      // capacity, and keep pointing at the same cleanup job.
      vi.setSystemTime(now + 1_000);
      for (let retry = 0; retry < 5; retry += 1) {
        expect(
          await user.as.mutation(api.bottles.deleteBottle, {
            bottleId: doomedBottleId,
          }),
        ).toBeNull();
      }
      const afterRetries = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(doomedBottleId),
        pendingJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.state.kind === "pending",
        ).length,
      }));
      expect(afterRetries.bottle?.deletingAt).toBe(pendingCleanup.bottle?.deletingAt);
      expect(afterRetries.bottle?.cleanupJobId).toBe(pendingCleanup.bottle?.cleanupJobId);
      expect(afterRetries.pendingJobs).toBe(pendingCleanup.pendingJobs);

      // The delayed watchdog repairs terminally canceled work without another
      // public delete call or removing the tombstone.
      await t.run(async (ctx) => {
        await ctx.scheduler.cancel(pendingCleanup.bottle!.cleanupJobId!);
      });
      vi.advanceTimersByTime(5 * 60 * 1000);
      await t.finishInProgressScheduledFunctions();
      const afterRepair = await t.run(async (ctx) => ctx.db.get(doomedBottleId));
      expect(afterRepair?.cleanupJobId).toBeDefined();
      expect(afterRepair?.cleanupJobId).not.toBe(pendingCleanup.bottle?.cleanupJobId);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const completedCleanup = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(doomedBottleId),
        doomedLogs: await ctx.db
          .query("wearLogs")
          .withIndex("by_bottle", (q) => q.eq("bottleId", doomedBottleId))
          .collect(),
        retainedBottle: await ctx.db.get(retainedBottleId),
        retainedLog: await ctx.db.get(retainedLogId),
        scheduledFunctions: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(completedCleanup.bottle).toBeNull();
      expect(completedCleanup.doomedLogs).toEqual([]);
      expect(completedCleanup.retainedBottle?.name).toBe("Retained");
      expect(completedCleanup.retainedLog?.bottleId).toBe(retainedBottleId);
      expect(
        completedCleanup.scheduledFunctions.filter((job) => job.state.kind === "failed"),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("internal cleanup enforces ownership and a strict 50-log batch boundary", async () => {
    const t = setupTest();
    const owner = await createTestUser(t, "Owner");
    const otherUser = await createTestUser(t, "Other");
    const deletingAt = Date.now();
    const bottleId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("bottles", {
        userId: owner.userId,
        name: "Boundary",
        createdAt: deletingAt,
        deletingAt,
      });
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert("wearLogs", {
          userId: owner.userId,
          bottleId: id,
          wornAt: deletingAt - index,
          sprays: 1,
        });
      }
      return id;
    });

    const args = {
      bottleId,
      expectedUserId: owner.userId,
      expectedDeletingAt: deletingAt,
    };
    vi.useFakeTimers();
    try {
      expect(
        await t.mutation(internal.bottles.deleteBottleBatch, {
          ...args,
          expectedUserId: otherUser.userId,
        }),
      ).toBeNull();
      expect(
        await t.run(async (ctx) =>
          ctx.db
            .query("wearLogs")
            .withIndex("by_bottle", (q) => q.eq("bottleId", bottleId))
            .collect(),
        ),
      ).toHaveLength(51);

      expect(await t.mutation(internal.bottles.deleteBottleBatch, args)).toBeNull();
      const afterFirstBatch = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        logs: await ctx.db
          .query("wearLogs")
          .withIndex("by_bottle", (q) => q.eq("bottleId", bottleId))
          .collect(),
      }));
      expect(afterFirstBatch.bottle).not.toBeNull();
      expect(afterFirstBatch.logs).toHaveLength(1);

      expect(await t.mutation(internal.bottles.deleteBottleBatch, args)).toBeNull();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const afterSecondBatch = await t.run(async (ctx) => ({
        bottle: await ctx.db.get(bottleId),
        logs: await ctx.db
          .query("wearLogs")
          .withIndex("by_bottle", (q) => q.eq("bottleId", bottleId))
          .collect(),
        failedJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.state.kind === "failed",
        ),
      }));
      expect(afterSecondBatch.bottle).toBeNull();
      expect(afterSecondBatch.logs).toEqual([]);
      expect(afterSecondBatch.failedJobs).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("caps persistent watchdog failures and recovers on an owner retry", async () => {
    const t = setupTest();
    const user = await createTestUser(t, "Cleanup owner");
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Persistent failure",
    });

    vi.useFakeTimers();
    try {
      const now = Date.now();
      await user.as.mutation(api.bottles.deleteBottle, { bottleId });

      let current = await t.run(async (ctx) => ctx.db.get(bottleId));
      const deletionNonce = current!.deletingAt!;
      expect(current?.cleanupStatus).toBe("pending");
      expect(current?.cleanupAttempts).toBe(1);
      expect(current?.cleanupNextRetryAt).toBe(now + 5 * 60 * 1000);

      const nextWatchdogDelays = [15, 30, 60].map((minutes) => minutes * 60 * 1000);
      for (let failedAttempt = 1; failedAttempt <= 4; failedAttempt += 1) {
        const cleanupJobId = current!.cleanupJobId!;
        await t.run(async (ctx) => {
          await ctx.scheduler.cancel(cleanupJobId);
        });

        await t.mutation(internal.bottles.watchBottleDeletion, {
          bottleId,
          expectedUserId: user.userId,
          expectedDeletingAt: deletionNonce,
        });
        current = await t.run(async (ctx) => ctx.db.get(bottleId));

        if (failedAttempt < 4) {
          expect(current?.cleanupStatus).toBe("pending");
          expect(current?.cleanupAttempts).toBe(failedAttempt + 1);
          expect(current?.deletingAt).toBe(deletionNonce);
          expect(current?.cleanupNextRetryAt).toBe(now + nextWatchdogDelays[failedAttempt - 1]);
        } else {
          expect(current?.cleanupStatus).toBe("failed");
          expect(current?.cleanupAttempts).toBe(4);
          expect(current?.cleanupNextRetryAt).toBeUndefined();
          expect(current?.cleanupLastError).toContain("retry limit");
        }
      }

      const failedCleanupJobId = current!.cleanupJobId;
      await t.mutation(internal.bottles.watchBottleDeletion, {
        bottleId,
        expectedUserId: user.userId,
        expectedDeletingAt: deletionNonce,
      });
      const capped = await t.run(async (ctx) => ctx.db.get(bottleId));
      expect(capped?.cleanupJobId).toBe(failedCleanupJobId);
      expect(capped?.cleanupAttempts).toBe(4);

      // All watchdogs already queued for this nonce are finite and become
      // no-ops after the failed state is recorded.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await user.as.mutation(api.bottles.deleteBottle, { bottleId });
      const retried = await t.run(async (ctx) => ctx.db.get(bottleId));
      expect(retried?.cleanupStatus).toBe("pending");
      expect(retried?.cleanupAttempts).toBe(1);
      expect(retried?.deletingAt).toBeGreaterThan(deletionNonce);
      expect(retried?.cleanupJobId).not.toBe(failedCleanupJobId);

      // A delayed job from the exhausted generation cannot replace the new
      // attempt because its deletion nonce is stale.
      await t.mutation(internal.bottles.watchBottleDeletion, {
        bottleId,
        expectedUserId: user.userId,
        expectedDeletingAt: deletionNonce,
      });
      const afterStaleWatchdog = await t.run(async (ctx) => ctx.db.get(bottleId));
      expect(afterStaleWatchdog?.deletingAt).toBe(retried?.deletingAt);
      expect(afterStaleWatchdog?.cleanupJobId).toBe(retried?.cleanupJobId);

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => ctx.db.get(bottleId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
  test("blank name is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(user.as.mutation(api.bottles.addBottle, { name: "   " })).rejects.toThrowError(
      "Name is required.",
    );
  });

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

  test("NaN sizeMl is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    await expect(
      user.as.mutation(api.bottles.addBottle, {
        name: "Test",
        sizeMl: Number.NaN,
      }),
    ).rejects.toThrowError("sizeMl must be a finite number.");
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
  test("blank name is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, {
        bottleId,
        name: "   ",
      }),
    ).rejects.toThrowError("Name is required.");
  });

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

  test("NaN sizeMl is rejected", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
      sizeMl: 100,
    });
    await expect(
      user.as.mutation(api.bottles.updateBottle, {
        bottleId,
        sizeMl: Number.NaN,
      }),
    ).rejects.toThrowError("sizeMl must be a finite number.");
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

// ── P1: toggleFavorite ──────────────────────────────────────────────────────

describe("toggleFavorite", () => {
  test("marks an unfavorited bottle as favorite", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
    });

    await user.as.mutation(api.bottles.toggleFavorite, { bottleId });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.isFavorite).toBe(true);
  });

  test("toggles a favorited bottle back to unfavorited", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
    });
    await user.as.mutation(api.bottles.toggleFavorite, { bottleId });
    await user.as.mutation(api.bottles.toggleFavorite, { bottleId });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(bottle!.isFavorite).toBe(false);
  });

  test("freshly added bottles default to not favorited", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
    });

    const bottle = await user.as.query(api.bottles.getBottle, { bottleId });
    // undefined is treated as false in the UI; either is acceptable but we
    // assert explicitly to guard against accidental true-by-default.
    expect(bottle!.isFavorite ?? false).toBe(false);
  });

  test("does not modify updatedAt (favoriting is not a content edit)", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Aventus",
    });
    const before = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(before!.updatedAt).toBeUndefined();

    await user.as.mutation(api.bottles.toggleFavorite, { bottleId });

    const after = await user.as.query(api.bottles.getBottle, { bottleId });
    expect(after!.updatedAt).toBeUndefined();
  });

  test("throws when called unauthenticated", async () => {
    const t = setupTest();
    const user = await createTestUser(t);
    const bottleId = await user.as.mutation(api.bottles.addBottle, {
      name: "Test",
    });

    await expect(t.mutation(api.bottles.toggleFavorite, { bottleId })).rejects.toThrowError(
      "Unauthenticated.",
    );
  });

  test("throws when toggling another user's bottle", async () => {
    const t = setupTest();
    const alice = await createTestUser(t, "Alice");
    const bob = await createTestUser(t, "Bob");
    const bottleId = await alice.as.mutation(api.bottles.addBottle, {
      name: "Alice Only",
    });

    await expect(bob.as.mutation(api.bottles.toggleFavorite, { bottleId })).rejects.toThrowError(
      "Bottle not found or access denied.",
    );
  });
});
