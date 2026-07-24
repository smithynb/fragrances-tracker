import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";
import { Id } from "./_generated/dataModel";

type T = ReturnType<typeof setupTest>;
type As = Awaited<ReturnType<typeof createTestUser>>["as"];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

async function addBottle(as: As, name: string) {
  return await as.mutation(api.bottles.addBottle, { name });
}

async function wear(as: As, bottleId: Id<"bottles">, wornAt: number, sprays = 2, rating?: number) {
  return await as.mutation(api.wearLogs.addWearLog, { bottleId, wornAt, sprays, rating });
}

describe("insights", () => {
  let t: T;
  beforeEach(() => {
    t = setupTest();
  });

  describe("listWearLogsFiltered", () => {
    test("filters by time range and bottle, newest first", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      const b = await addBottle(as, "B");
      await wear(as, a, NOW - 3 * DAY);
      await wear(as, a, NOW - 1 * DAY);
      await wear(as, b, NOW - 2 * DAY);

      const all = await as.query(api.insights.listWearLogsFiltered, {});
      expect(all.map((l) => l.bottleId)).toEqual([a, b, a]); // desc by wornAt

      const ranged = await as.query(api.insights.listWearLogsFiltered, {
        from: NOW - 2.5 * DAY,
        to: NOW - 1.5 * DAY,
      });
      expect(ranged).toHaveLength(1);
      expect(ranged[0].bottleId).toBe(b);

      const onlyA = await as.query(api.insights.listWearLogsFiltered, { bottleId: a });
      expect(onlyA).toHaveLength(2);
    });

    test("clamps limit and never returns another user's logs", async () => {
      const { as } = await createTestUser(t);
      const { as: asOther } = await createTestUser(t);
      const mine = await addBottle(as, "mine");
      const theirs = await addBottle(asOther, "theirs");
      await wear(as, mine, NOW - DAY);
      await wear(as, mine, NOW - 2 * DAY);
      await wear(asOther, theirs, NOW - DAY);

      expect(await as.query(api.insights.listWearLogsFiltered, { limit: 1 })).toHaveLength(1);
      expect(await as.query(api.insights.listWearLogsFiltered, { limit: 9999 })).toHaveLength(2);
      // Foreign bottleId: user-scoped index yields nothing, no error, no leak.
      expect(await as.query(api.insights.listWearLogsFiltered, { bottleId: theirs })).toEqual([]);
    });
  });

  describe("collectionStats", () => {
    test("aggregates per bottle with lastWornAt and totals, including unworn bottles", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      const b = await addBottle(as, "B");
      const c = await addBottle(as, "C"); // never worn
      await as.mutation(api.bottles.toggleFavorite, { bottleId: c });
      await wear(as, a, NOW - 3 * DAY, 2, 8);
      await wear(as, a, NOW - 1 * DAY, 3, 6);
      await wear(as, b, NOW - 2 * DAY, 4);

      const stats = await as.query(api.insights.collectionStats, {});
      expect(stats.totals).toEqual({
        bottleCount: 3,
        totalWears: 3,
        totalSprays: 9,
        favoriteCount: 1,
        unwornBottleCount: 1,
        mostWornBottleId: a,
        leastWornBottleId: b,
      });

      const rowA = stats.bottles.find((x) => x.bottleId === a)!;
      expect(rowA).toMatchObject({ name: "A", wears: 2, sprays: 5, avgRating: 7 });
      expect(rowA.lastWornAt).toBe(NOW - 1 * DAY);

      const rowC = stats.bottles.find((x) => x.bottleId === c)!;
      expect(rowC).toMatchObject({ wears: 0, sprays: 0, avgRating: null, lastWornAt: null, isFavorite: true });
    });

    test("empty collection yields zero totals with null most/least worn", async () => {
      const { as } = await createTestUser(t);
      const stats = await as.query(api.insights.collectionStats, {});
      expect(stats.bottles).toEqual([]);
      expect(stats.totals.mostWornBottleId).toBeNull();
      expect(stats.totals.leastWornBottleId).toBeNull();
    });
  });

  describe("collectionSnapshot", () => {
    test("returns bottles with stats and capped recent logs, newest first", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      for (let i = 1; i <= 4; i++) await wear(as, a, NOW - i * DAY);

      const snap = await as.query(api.insights.collectionSnapshot, { recentLogsPerBottle: 2 });
      expect(snap.bottles).toHaveLength(1);
      const row = snap.bottles[0];
      expect(row.wears).toBe(4);
      expect(row.recentLogs).toHaveLength(2);
      expect(row.recentLogs[0].wornAt).toBe(NOW - 1 * DAY);
      expect(row.recentLogs[1].wornAt).toBe(NOW - 2 * DAY);
    });

    test("does not include other users' data", async () => {
      const { as } = await createTestUser(t);
      const { as: asOther } = await createTestUser(t);
      await addBottle(asOther, "theirs");
      const snap = await as.query(api.insights.collectionSnapshot, {});
      expect(snap.bottles).toEqual([]);
    });
  });
});
