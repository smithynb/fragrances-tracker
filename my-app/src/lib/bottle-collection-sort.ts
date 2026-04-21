import type { Doc } from "../../convex/_generated/dataModel";

export type SortOption = "created" | "name" | "wears" | "rating";
export type SortDir = "asc" | "desc";

export type BottleCollectionItem = Doc<"bottles">;

export type BottleStatsMap = Record<
  string,
  { wears: number; sprays: number; avgRating: number | null }
>;

const EMPTY_STATS = { wears: 0, sprays: 0, avgRating: null };

function compareNames(a: BottleCollectionItem, b: BottleCollectionItem): number {
  return a.name.localeCompare(b.name);
}

function compareCreatedDesc(
  a: BottleCollectionItem,
  b: BottleCollectionItem,
): number {
  return b._creationTime - a._creationTime;
}

function compareFallback(
  a: BottleCollectionItem,
  b: BottleCollectionItem,
): number {
  return compareNames(a, b) || compareCreatedDesc(a, b) || a._id.localeCompare(b._id);
}

function matchesSearch(bottle: BottleCollectionItem, rawSearch: string): boolean {
  const search = rawSearch.trim().toLowerCase();
  if (!search) return true;

  return (
    bottle.name.toLowerCase().includes(search) ||
    bottle.brand?.toLowerCase().includes(search) ||
    bottle.tags?.some((tag) => tag.toLowerCase().includes(search)) ||
    false
  );
}

export function getBottleStats(
  bottleStats: BottleStatsMap | undefined,
  bottleId: string,
) {
  return bottleStats?.[bottleId] ?? EMPTY_STATS;
}

export function getNextSortState(
  currentSortBy: SortOption,
  currentSortDir: SortDir,
  option: SortOption,
): { sortBy: SortOption; sortDir: SortDir } {
  if (currentSortBy === option) {
    return {
      sortBy: option,
      sortDir: currentSortDir === "asc" ? "desc" : "asc",
    };
  }

  return {
    sortBy: option,
    sortDir: option === "name" ? "asc" : "desc",
  };
}

export function filterAndSortBottles({
  bottles,
  bottleStats,
  search,
  sortBy,
  sortDir,
}: {
  bottles: BottleCollectionItem[];
  bottleStats: BottleStatsMap | undefined;
  search: string;
  sortBy: SortOption;
  sortDir: SortDir;
}): BottleCollectionItem[] {
  const filtered = bottles.filter((bottle) => matchesSearch(bottle, search));
  const dir = sortDir === "asc" ? 1 : -1;

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return dir * compareNames(a, b) || compareCreatedDesc(a, b) || a._id.localeCompare(b._id);
      case "wears": {
        const aWears = getBottleStats(bottleStats, a._id).wears;
        const bWears = getBottleStats(bottleStats, b._id).wears;
        return dir * (aWears - bWears) || compareFallback(a, b);
      }
      case "rating": {
        const aRating = getBottleStats(bottleStats, a._id).avgRating;
        const bRating = getBottleStats(bottleStats, b._id).avgRating;
        if (aRating === null && bRating === null) return compareFallback(a, b);
        if (aRating === null) return 1;
        if (bRating === null) return -1;
        return dir * (aRating - bRating) || compareFallback(a, b);
      }
      case "created":
      default:
        return dir * (a._creationTime - b._creationTime) || compareNames(a, b) || a._id.localeCompare(b._id);
    }
  });
}
