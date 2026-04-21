import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  filterAndSortBottles,
  getBottleStats,
  getNextSortState,
  type BottleCollectionItem,
  type BottleStatsMap,
} from "./bottle-collection-sort";

function bottle(
  id: string,
  name: string,
  creationTime: number,
  overrides: Partial<BottleCollectionItem> = {},
): BottleCollectionItem {
  return {
    _id: id as Id<"bottles">,
    _creationTime: creationTime,
    userId: "test-user" as Id<"users">,
    createdAt: creationTime,
    name,
    brand: undefined,
    tags: undefined,
    ...overrides,
  };
}

const bottles: BottleCollectionItem[] = [
  bottle("b1", "Zoologist Bee", 100, {
    brand: "Zoologist",
    tags: ["honey", "amber"],
  }),
  bottle("b2", "Acqua di Parma", 300, {
    brand: "Parma",
    tags: ["citrus"],
  }),
  bottle("b3", "Byredo Bal d'Afrique", 200, {
    brand: "Byredo",
    tags: ["vetiver"],
  }),
  bottle("b4", "Amouage Jubilation", 200, {
    brand: "Amouage",
    tags: ["resin"],
  }),
];

const stats: BottleStatsMap = {
  b1: { wears: 4, sprays: 20, avgRating: 7.5 },
  b2: { wears: 2, sprays: 6, avgRating: null },
  b3: { wears: 4, sprays: 12, avgRating: 9 },
  b4: { wears: 1, sprays: 3, avgRating: 7.5 },
};

function names(items: BottleCollectionItem[]): string[] {
  return items.map((item) => item.name);
}

describe("getNextSortState", () => {
  test("toggles direction when selecting the active option", () => {
    expect(getNextSortState("created", "desc", "created")).toEqual({
      sortBy: "created",
      sortDir: "asc",
    });
    expect(getNextSortState("name", "asc", "name")).toEqual({
      sortBy: "name",
      sortDir: "desc",
    });
  });

  test("uses sensible defaults when selecting a new option", () => {
    expect(getNextSortState("created", "desc", "name")).toEqual({
      sortBy: "name",
      sortDir: "asc",
    });
    expect(getNextSortState("name", "asc", "rating")).toEqual({
      sortBy: "rating",
      sortDir: "desc",
    });
  });
});

describe("getBottleStats", () => {
  test("returns zeroed defaults when stats are missing", () => {
    expect(getBottleStats(undefined, "missing")).toEqual({
      wears: 0,
      sprays: 0,
      avgRating: null,
    });
    expect(getBottleStats(stats, "missing")).toEqual({
      wears: 0,
      sprays: 0,
      avgRating: null,
    });
  });
});

describe("filterAndSortBottles", () => {
  test("sorts by created descending by default and breaks ties by name", () => {
    const result = filterAndSortBottles({
      bottles,
      bottleStats: stats,
      search: "",
      sortBy: "created",
      sortDir: "desc",
    });

    expect(names(result)).toEqual([
      "Acqua di Parma",
      "Amouage Jubilation",
      "Byredo Bal d'Afrique",
      "Zoologist Bee",
    ]);
  });

  test("sorts by created ascending", () => {
    const result = filterAndSortBottles({
      bottles,
      bottleStats: stats,
      search: "",
      sortBy: "created",
      sortDir: "asc",
    });

    expect(names(result)).toEqual([
      "Zoologist Bee",
      "Amouage Jubilation",
      "Byredo Bal d'Afrique",
      "Acqua di Parma",
    ]);
  });

  test("sorts by name in both directions", () => {
    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "name",
          sortDir: "asc",
        }),
      ),
    ).toEqual([
      "Acqua di Parma",
      "Amouage Jubilation",
      "Byredo Bal d'Afrique",
      "Zoologist Bee",
    ]);

    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "name",
          sortDir: "desc",
        }),
      ),
    ).toEqual([
      "Zoologist Bee",
      "Byredo Bal d'Afrique",
      "Amouage Jubilation",
      "Acqua di Parma",
    ]);
  });

  test("sorts by wears in both directions with deterministic tie-breakers", () => {
    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "wears",
          sortDir: "desc",
        }),
      ),
    ).toEqual([
      "Byredo Bal d'Afrique",
      "Zoologist Bee",
      "Acqua di Parma",
      "Amouage Jubilation",
    ]);

    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "wears",
          sortDir: "asc",
        }),
      ),
    ).toEqual([
      "Amouage Jubilation",
      "Acqua di Parma",
      "Byredo Bal d'Afrique",
      "Zoologist Bee",
    ]);
  });

  test("sorts by rating in both directions and always keeps unrated bottles last", () => {
    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "rating",
          sortDir: "desc",
        }),
      ),
    ).toEqual([
      "Byredo Bal d'Afrique",
      "Amouage Jubilation",
      "Zoologist Bee",
      "Acqua di Parma",
    ]);

    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "",
          sortBy: "rating",
          sortDir: "asc",
        }),
      ),
    ).toEqual([
      "Amouage Jubilation",
      "Zoologist Bee",
      "Byredo Bal d'Afrique",
      "Acqua di Parma",
    ]);
  });

  test("uses zeroed stats for bottles without wear data", () => {
    const result = filterAndSortBottles({
      bottles: [...bottles, bottle("b5", "CdG Avignon", 250)],
      bottleStats: stats,
      search: "",
      sortBy: "wears",
      sortDir: "asc",
    });

    expect(names(result).slice(0, 2)).toEqual([
      "CdG Avignon",
      "Amouage Jubilation",
    ]);
  });

  test("filters by name, brand, and tags before sorting", () => {
    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "parma",
          sortBy: "name",
          sortDir: "asc",
        }),
      ),
    ).toEqual(["Acqua di Parma"]);

    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "vetiver",
          sortBy: "name",
          sortDir: "asc",
        }),
      ),
    ).toEqual(["Byredo Bal d'Afrique"]);

    expect(
      names(
        filterAndSortBottles({
          bottles,
          bottleStats: stats,
          search: "  zoo ",
          sortBy: "name",
          sortDir: "asc",
        }),
      ),
    ).toEqual(["Zoologist Bee"]);
  });

  test("combines filtering with non-default sort orders", () => {
    const result = filterAndSortBottles({
      bottles,
      bottleStats: stats,
      search: "am",
      sortBy: "rating",
      sortDir: "desc",
    });

    expect(names(result)).toEqual([
      "Amouage Jubilation",
      "Zoologist Bee",
    ]);
  });

  test("does not mutate the original bottle array", () => {
    const original = [...bottles];

    filterAndSortBottles({
      bottles: original,
      bottleStats: stats,
      search: "",
      sortBy: "rating",
      sortDir: "desc",
    });

    expect(names(original)).toEqual([
      "Zoologist Bee",
      "Acqua di Parma",
      "Byredo Bal d'Afrique",
      "Amouage Jubilation",
    ]);
  });
});
