"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { BottleCard } from "@/components/bottle-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Wine } from "lucide-react";
import { useState, useMemo } from "react";

interface BottleCollectionProps {
  selectedBottleId: Id<"bottles"> | null;
  onSelectBottle: (id: Id<"bottles">) => void;
  onAddBottle: () => void;
}

export function BottleCollection({
  selectedBottleId,
  onSelectBottle,
  onAddBottle,
}: BottleCollectionProps) {
  const bottles = useQuery(api.bottles.listBottles);
  const bottleStatsMap = useQuery(api.wearLogs.listBottleStats);
  const [search, setSearch] = useState("");

  // bottleStatsMap is already aggregated server-side; just look up per bottle.
  const getStats = (bottleId: string) =>
    bottleStatsMap ? (bottleStatsMap[bottleId] ?? { wears: 0, sprays: 0 }) : undefined;

  const filteredBottles = useMemo(() => {
    if (!bottles) return [];
    if (!search.trim()) return bottles;
    const q = search.toLowerCase();
    return bottles.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.brand?.toLowerCase().includes(q) ||
        b.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [bottles, search]);

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
        <div className="flex-1 overflow-y-auto scrollbar-fade pb-5 pt-4">
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
    return (
      <div className="flex h-full flex-col items-center justify-center py-16 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
          <Wine className="h-8 w-8 text-text-secondary/50" />
        </div>
        <h3 className="font-display text-xl font-semibold text-text mb-1">
          Your collection awaits
        </h3>
        <p className="text-sm text-text-secondary text-center max-w-[240px] mb-6">
          Add your first fragrance to start tracking your collection and wear
          history.
        </p>
        <Button onClick={onAddBottle} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Fragrance
        </Button>
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

      {/* Count */}
      <div className="pt-2 pb-2 animate-fade-up stagger-2">
        <p className="text-xs text-text-secondary">
          {filteredBottles.length} fragrance
          {filteredBottles.length !== 1 ? "s" : ""}
          {search && ` matching "${search}"`}
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-fade pb-5 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredBottles.map((bottle, i) => {
            const stats = getStats(bottle._id);
            return (
              <BottleCard
                key={bottle._id}
                bottle={bottle}
                isSelected={selectedBottleId === bottle._id}
                onClick={() => onSelectBottle(bottle._id)}
                totalSprays={stats?.sprays}
                totalWears={stats?.wears}
                index={i}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
