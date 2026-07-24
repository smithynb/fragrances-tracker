import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  updateBottleShape,
  addWearLogShape,
  listWearLogsShape,
  getCollectionSnapshotShape,
} from "./tool-schemas";

describe("tool schemas", () => {
  test("update_fragrance accepts null to clear optional fields but not for name", () => {
    const schema = z.object(updateBottleShape);
    expect(schema.safeParse({ bottleId: "x", brand: null, sizeMl: null }).success).toBe(true);
    expect(schema.safeParse({ bottleId: "x", name: null }).success).toBe(false);
  });

  test("log_fragrance_wear enforces integer spray bounds and rating range", () => {
    const schema = z.object(addWearLogShape);
    const base = { bottleId: "x", wornAt: 1700000000000 };
    expect(schema.safeParse({ ...base, sprays: 3 }).success).toBe(true);
    expect(schema.safeParse({ ...base, sprays: 2.5 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 101 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 3, rating: 11 }).success).toBe(false);
  });

  test("list_fragrance_wears bounds limit and snapshot bounds recentLogsPerBottle", () => {
    expect(z.object(listWearLogsShape).safeParse({ limit: 501 }).success).toBe(false);
    expect(z.object(listWearLogsShape).safeParse({}).success).toBe(true);
    expect(z.object(getCollectionSnapshotShape).safeParse({ recentLogsPerBottle: 21 }).success).toBe(false);
  });
});
