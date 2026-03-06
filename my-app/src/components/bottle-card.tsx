"use client";

import { Doc } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Droplets } from "lucide-react";

interface BottleCardProps {
  bottle: Doc<"bottles">;
  isSelected: boolean;
  onClick: () => void;
  totalSprays?: number;
  totalWears?: number;
  index: number;
}

export function BottleCard({
  bottle,
  isSelected,
  onClick,
  totalSprays,
  totalWears,
  index,
}: BottleCardProps) {
  const staggerClass = `stagger-${Math.min(index + 1, 8)}`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-xl border px-6 py-5 transition-all duration-200 cursor-pointer",
        "hover:shadow-md hover:-translate-y-0.5",
        "animate-fade-up opacity-0",
        staggerClass,
        isSelected
          ? "border-accent bg-accent-subtle shadow-sm"
          : "border-border bg-surface hover:border-border-hover"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-snug text-text truncate">
            {bottle.name}
          </h3>
          {bottle.brand && (
            <p className="text-sm text-text-secondary mt-1 truncate">
              {bottle.brand}
            </p>
          )}
        </div>
        {bottle.sizeMl && (
          <span className="text-xs text-text-secondary whitespace-nowrap font-medium bg-surface-alt rounded-md px-2 py-1">
            {bottle.sizeMl}ml
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3.5">
        {totalWears !== undefined && totalWears > 0 && (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Droplets className="h-3 w-3" />
            <span>
              {totalWears} wear{totalWears !== 1 ? "s" : ""}
            </span>
          </div>
        )}
        {totalSprays !== undefined && totalSprays > 0 && (
          <div className="text-xs text-text-secondary">
            {totalSprays} sprays
          </div>
        )}
      </div>

      {/* Tags */}
      {bottle.tags && bottle.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {bottle.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="tag" className="text-[10px] px-2 py-0.5">
              {tag}
            </Badge>
          ))}
          {bottle.tags.length > 3 && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
              +{bottle.tags.length - 3}
            </Badge>
          )}
        </div>
      )}
    </button>
  );
}
