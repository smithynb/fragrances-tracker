"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { BottleCard } from "@/components/bottle-card";
import { CoachMark } from "@/components/coach-mark";
import { FavoriteToggle } from "@/components/favorite-toggle";
import { cn } from "@/lib/utils";
import {
  filterAndSortBottles,
  getBottleStats,
  getNextSortState,
  type SortDir,
  type SortOption,
} from "@/lib/bottle-collection-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { type OnboardingStep } from "@/lib/use-onboarding";
import { Plus, Wine, ArrowUp, ArrowDown, Check } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";

const SORT_LABELS: Record<SortOption, string> = {
  created: "Date Added",
  favorites: "Favorites",
  name: "Name",
  wears: "Wears",
  rating: "Rating",
};

interface BottleCollectionProps {
  selectedBottleId: Id<"bottles"> | null;
  onSelectBottle: (id: Id<"bottles">) => void;
  onAddBottle: () => void;
  onboardingStep?: OnboardingStep;
  onAdvanceOnboarding?: () => void;
  onDismissOnboarding?: () => void;
}

export function BottleCollection({
  selectedBottleId,
  onSelectBottle,
  onAddBottle,
  onboardingStep,
  onAdvanceOnboarding,
  onDismissOnboarding,
}: BottleCollectionProps) {
  const bottles = useQuery(api.bottles.listBottles);
  const bottleStats = useQuery(api.wearLogs.listBottleStats);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Track whether we've already auto-advanced from welcome → select-bottle.
  // This prevents the advance from firing on every re-render.
  const hasAdvancedWelcome = useRef(false);

  // Auto-advance: when bottles appear during the 'welcome' step,
  // transition to 'select-bottle'.
  useEffect(() => {
    if (
      onboardingStep === "welcome" &&
      bottles &&
      bottles.length > 0 &&
      !hasAdvancedWelcome.current
    ) {
      hasAdvancedWelcome.current = true;
      onAdvanceOnboarding?.();
    }
  }, [onboardingStep, bottles, onAdvanceOnboarding]);

  // Reset when the tour leaves the welcome step so the ref is fresh
  // if onboarding is re-triggered (e.g. via NEXT_PUBLIC_FORCE_ONBOARDING).
  useEffect(() => {
    if (onboardingStep !== "welcome") {
      hasAdvancedWelcome.current = false;
    }
  }, [onboardingStep]);

  const handleSort = (option: SortOption) => {
    const next = getNextSortState(sortBy, sortDir, option);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
  };

  const filteredBottles = useMemo(() => {
    if (!bottles) return [];
    return filterAndSortBottles({
      bottles,
      bottleStats,
      search,
      sortBy,
      sortDir,
    });
  }, [bottles, search, sortBy, sortDir, bottleStats]);

  if (bottles === undefined) {
    return (
      <div className="flex h-full flex-col">
        {/* Search + Add Skeleton */}
        <div className="flex items-center gap-4 pt-5 pb-0 animate-fade-up stagger-1">
          <div className="min-w-0 flex-1">
            <div className="h-10 rounded-xl bg-surface-alt animate-shimmer" />
          </div>
          <div className="h-9 w-9 shrink-0 rounded-md bg-surface-alt animate-shimmer" />
        </div>

        {/* Count Skeleton */}
        <div className="pt-2 pb-2 animate-fade-up stagger-2">
          <div className="h-3 w-24 rounded bg-surface-alt animate-shimmer mt-1 mb-1" />
        </div>

        {/* Grid Skeleton */}
        <div className="flex-1 overflow-y-auto scrollbar-fade pb-5 pt-4 -ml-2 pl-2 -mr-6 pr-6 lg:-mr-7 lg:pr-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[142px] rounded-xl border border-border bg-surface-alt/30 animate-shimmer"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (bottles.length === 0) {
    const isWelcome = onboardingStep === "welcome";
    return (
      <div className="flex h-full flex-col items-center justify-center py-16 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
          <Wine className="h-8 w-8 text-text-secondary/50" />
        </div>
        <h3 className="font-display text-xl font-semibold text-text mb-1">
          {isWelcome ? "Welcome! Let\u2019s get started" : "Your collection awaits"}
        </h3>
        <p className="text-sm text-text-secondary text-center max-w-[240px] mb-6">
          {isWelcome
            ? "Add your first fragrance to begin your tracking journey."
            : "Add your first fragrance to start tracking your collection and wear history."}
        </p>
        <div className={cn("relative", isWelcome && "z-50")}>
          <Button
            onClick={onAddBottle}
            className={cn("gap-2", isWelcome && "coach-pulse")}
          >
            <Plus className="h-4 w-4" />
            Add Fragrance
          </Button>
          {isWelcome && onDismissOnboarding && (
            <CoachMark
              step={1}
              totalSteps={3}
              title="Add your first fragrance"
              description="Start by adding a fragrance from your collection."
              onDismiss={onDismissOnboarding}
              position="bottom"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + Add */}
      <div className="flex items-center gap-4 pt-5 pb-0 animate-fade-up stagger-1">
        <div className="min-w-0 flex-1">
          <Input
            id="fragrance-search"
            placeholder="Search fragrances..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search fragrances"
            className="h-10 rounded-xl border-border/80 bg-surface/80 px-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset] backdrop-blur-sm focus:border-accent focus:bg-input-focus focus:ring-ring/60"
          />
        </div>
        <Button
          onClick={onAddBottle}
          size="sm"
          aria-label="Add fragrance"
          className="h-9 w-9 shrink-0 p-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Count + Sort */}
      <div className="flex items-center justify-between pt-2 pb-2 animate-fade-up stagger-2">
        <p className="text-xs text-text-secondary">
          {filteredBottles.length} fragrance
          {filteredBottles.length !== 1 ? "s" : ""}
          {search && ` matching "${search}"`}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-text-secondary hover:text-text px-2"
              aria-label="Sort fragrances"
            >
              {sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {SORT_LABELS[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => {
              const isActive = sortBy === option;
              return (
                <DropdownMenuItem
                  key={option}
                  onSelect={(e) => {
                    e.preventDefault();
                    handleSort(option);
                  }}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2">
                    {isActive && <Check className="h-3 w-3 text-accent" />}
                    {!isActive && <span className="w-3" />}
                    {SORT_LABELS[option]}
                  </span>
                  {isActive && (
                    sortDir === "asc"
                      ? <ArrowUp className="h-3 w-3 text-text-secondary" />
                      : <ArrowDown className="h-3 w-3 text-text-secondary" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-fade pb-5 pt-4 -ml-2 pl-2 -mr-6 pr-6 lg:-mr-7 lg:pr-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 reduced-motion-fade-in">
          {filteredBottles.map((bottle, i) => {
            const stats = getBottleStats(bottleStats, bottle._id);
            const showCoachMark = i === 0 && onboardingStep === "select-bottle";
            return (
              <div key={bottle._id} className={cn("relative group", showCoachMark && "z-50")}>
                <BottleCard
                  bottle={bottle}
                  isSelected={selectedBottleId === bottle._id}
                  onClick={() => onSelectBottle(bottle._id)}
                  totalSprays={stats?.sprays}
                  totalWears={stats?.wears}
                  avgRating={stats?.avgRating ?? null}
                  index={i}
                  className={showCoachMark ? "coach-pulse" : undefined}
                />
                <FavoriteToggle
                  bottleId={bottle._id}
                  isFavorite={bottle.isFavorite ?? false}
                  size="card"
                  className="absolute -top-2 -right-2 z-10 bg-surface/90 shadow-sm backdrop-blur-sm"
                />
                {showCoachMark && onDismissOnboarding && (
                  <CoachMark
                    step={2}
                    totalSteps={3}
                    title="Open your fragrance"
                    description="Tap to see details and start tracking wears."
                    onDismiss={onDismissOnboarding}
                    position="bottom"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
