"use client";

import { useRef, useState, useLayoutEffect } from "react";
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
  const tags = bottle.tags ?? [];
  const sizerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    const container = containerRef.current;
    if (!sizer || !container || tags.length === 0) return;

    const calculate = () => {
      const containerWidth = container.clientWidth;
      const tagEls = Array.from(sizer.querySelectorAll<HTMLElement>("[data-tag]"));
      const gap = 6; // gap-1.5 = 6px
      const plusW = 40; // conservative width for "+N" badge

      let usedWidth = 0;
      let count = 0;

      for (let i = 0; i < tagEls.length; i++) {
        const tagWidth = tagEls[i].getBoundingClientRect().width;
        const addGap = i > 0 ? gap : 0;
        const wouldShowAll = count + 1 === tags.length;
        const plusSpace = wouldShowAll ? 0 : gap + plusW;

        if (usedWidth + addGap + tagWidth + plusSpace <= containerWidth) {
          usedWidth += addGap + tagWidth;
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(count);
    };

    calculate();
    const ro = new ResizeObserver(calculate);
    ro.observe(container);
    return () => ro.disconnect();
  }, [bottle.tags]); // stable reference from Convex doc; `tags` is derived from it

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-xl border px-6 py-5 transition-all duration-200 cursor-pointer",
        "hover:shadow-md hover:-translate-y-0.5",
        "animate-fade-up opacity-0",
        staggerClass,
        isSelected
          ? "border-accent bg-accent-subtle/60 shadow-sm"
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
      {tags.length > 0 && (
        <div className="relative mt-3.5">
          {/* Hidden sizer: renders all tags to measure their widths */}
          <div
            ref={sizerRef}
            className="absolute inset-x-0 flex flex-nowrap gap-1.5 invisible pointer-events-none overflow-hidden"
            aria-hidden="true"
            tabIndex={-1}
          >
            {tags.map((tag) => (
              <Badge key={tag} data-tag variant="tag" className="text-[10px] px-2 py-0.5 shrink-0">
                {tag}
              </Badge>
            ))}
          </div>
          {/* Visible row: only shows tags that fit on one line */}
          <div ref={containerRef} className="flex flex-nowrap gap-1.5 overflow-hidden">
            {tags.slice(0, visibleCount).map((tag) => (
              <Badge key={tag} variant="tag" className="text-[10px] px-2 py-0.5 shrink-0">
                {tag}
              </Badge>
            ))}
            {visibleCount < tags.length && (
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 shrink-0">
                +{tags.length - visibleCount}
              </Badge>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
