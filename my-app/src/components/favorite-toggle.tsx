"use client";

import type { MouseEvent } from "react";
import { Heart } from "lucide-react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

interface FavoriteToggleProps {
  bottleId: Id<"bottles">;
  isFavorite: boolean;
  /** Visual size variant. `card` hides the icon until hover for unfavorited
   * bottles. `detail` always shows it. */
  size?: "card" | "detail";
  className?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Module-scope optimistic updater.
// Declared once, outside the component, so `withOptimisticUpdate` receives a
// stable reference on every render. Re-creating the closure inside the
// component would cause Convex to treat each render as a fresh mutation.
// ──────────────────────────────────────────────────────────────────────────
function optimisticToggle(
  localStore: OptimisticLocalStore,
  args: { bottleId: Id<"bottles"> },
) {
  const list = localStore.getQuery(api.bottles.listBottles, {});
  if (list) {
    localStore.setQuery(
      api.bottles.listBottles,
      {},
      list.map((b) =>
        b._id === args.bottleId
          ? { ...b, isFavorite: !(b.isFavorite ?? false) }
          : b,
      ),
    );
  }

  const current = localStore.getQuery(api.bottles.getBottle, args);
  if (current) {
    localStore.setQuery(api.bottles.getBottle, args, {
      ...current,
      isFavorite: !(current.isFavorite ?? false),
    });
  }
}

export function FavoriteToggle({
  bottleId,
  isFavorite,
  size = "card",
  className,
}: FavoriteToggleProps) {
  const toggleFavorite = useMutation(
    api.bottles.toggleFavorite,
  ).withOptimisticUpdate(optimisticToggle);

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    // Defensive: not strictly needed because the toggle is a DOM sibling of
    // the card button (not a descendant), but cheap insurance against future
    // refactors placing it inside another clickable.
    e.stopPropagation();
    try {
      await toggleFavorite({ bottleId });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to toggle favorite:", err);
      }
      toast.error(getApiErrorMessage(err));
      // Convex auto-rolls back the optimistic patch on rejection.
    }
  };

  const dim = size === "detail" ? "h-10 w-10" : "h-7 w-7";
  const icon = size === "detail" ? "h-5 w-5" : "h-4 w-4";

  // Card variant hides the heart at rest when not favorited, surfaces it on
  // hover of the parent .group (the card wrapper). Detail variant is always
  // visible.
  const idleHide =
    size === "card" && !isFavorite
      ? "opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100"
      : "";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "group/heart relative flex items-center justify-center rounded-full",
        "transition-opacity focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-accent",
        dim,
        idleHide,
        className,
      )}
    >
      {/* Filled heart: shown when favorited, fades out on hover of *this*
          button so the outline overlay below becomes visible (signals the
          toggle-off affordance). */}
      <Heart
        className={cn(
          icon,
          "absolute transition-opacity",
          isFavorite
            ? "fill-pink-500 text-pink-500 opacity-100 group-hover/heart:opacity-0"
            : "opacity-0",
        )}
        aria-hidden="true"
      />
      {/* Outline heart: persistent for unfavorited, hover overlay for
          favorited. */}
      <Heart
        className={cn(
          icon,
          "absolute transition-opacity",
          isFavorite
            ? "text-pink-500 opacity-0 group-hover/heart:opacity-100"
            : "text-text-secondary opacity-100",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
