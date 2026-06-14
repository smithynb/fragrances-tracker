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

function compareCreatedDesc(a: BottleCollectionItem, b: BottleCollectionItem): number {
  return b._creationTime - a._creationTime;
}

function compareFallback(a: BottleCollectionItem, b: BottleCollectionItem): number {
  return compareNames(a, b) || compareCreatedDesc(a, b) || a._id.localeCompare(b._id);
}

type SearchQuery = {
  terms: string[];
};

function getSearchQuery(rawSearch: string): SearchQuery {
  return {
    terms: rawSearch.trim().toLowerCase().match(/\S+/g) ?? [],
  };
}

function matchesSearch(bottle: BottleCollectionItem, searchQuery: SearchQuery): boolean {
  const { terms } = searchQuery;
  if (terms.length === 0) return true;

  const name = bottle.name.toLowerCase();
  const brand = bottle.brand?.toLowerCase();

  return terms.every((term) => {
    if (name.includes(term) || (brand?.includes(term) ?? false)) return true;

    if (!bottle.tags || bottle.tags.length === 0) return false;

    for (const tag of bottle.tags) {
      if (tag.toLowerCase().includes(term)) {
        return true;
      }
    }

    return false;
  });
}

export function getBottleStats(bottleStats: BottleStatsMap | undefined, bottleId: string) {
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
  pinFavorites = false,
}: {
  bottles: BottleCollectionItem[];
  bottleStats: BottleStatsMap | undefined;
  search: string;
  sortBy: SortOption;
  sortDir: SortDir;
  pinFavorites?: boolean;
}): BottleCollectionItem[] {
  const searchQuery = getSearchQuery(search);
  const filtered =
    searchQuery.terms.length === 0
      ? bottles
      : bottles.filter((bottle) => matchesSearch(bottle, searchQuery));
  const dir = sortDir === "asc" ? 1 : -1;

  const baseComparator = (a: BottleCollectionItem, b: BottleCollectionItem): number => {
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
        return (
          dir * (a._creationTime - b._creationTime) ||
          compareNames(a, b) ||
          a._id.localeCompare(b._id)
        );
    }
  };

  const favCmp = (a: BottleCollectionItem, b: BottleCollectionItem): number =>
    Number(b.isFavorite ?? false) - Number(a.isFavorite ?? false);

  return [...filtered].sort((a, b) => {
    if (pinFavorites) {
      return favCmp(a, b) || baseComparator(a, b);
    }
    return baseComparator(a, b);
  });
}
