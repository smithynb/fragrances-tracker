"use client";

import { cn } from "@/lib/utils";
import { ONBOARDING_SETTLE_MS } from "@/lib/use-onboarding";
import { X } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface CoachMarkProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  onDismiss: () => void;
  /** Where the tooltip appears relative to the target. Arrow points opposite. */
  position?: "top" | "bottom";
  /**
   * Horizontal alignment hint.
   *   center — try to centre on the parent (default)
   *   start  — left-align to parent
   *   end    — right-align to parent
   * The tooltip is always clamped to the viewport so it never bleeds.
   */
  align?: "center" | "start" | "end";
  className?: string;
}

const TOOLTIP_W = 256; // w-64 = 16rem
const GAP = 12; // 0.75rem
const VIEWPORT_PAD = 12;

export function CoachMark({
  step,
  totalSteps,
  title,
  description,
  onDismiss,
  position = "bottom",
  align = "center",
  className,
}: CoachMarkProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [settled, setSettled] = useState(false);

  const sync = useCallback(() => {
    const parent = anchorRef.current?.parentElement;
    if (!parent) return;
    setRect(parent.getBoundingClientRect());
  }, []);

  // Delay initial render so card animations can finish and we measure
  // the final laid-out position.
  useEffect(() => {
    const id = setTimeout(() => {
      setSettled(true);
      sync();
    }, ONBOARDING_SETTLE_MS);
    return () => clearTimeout(id);
  }, [sync]);

  // Re-measure on scroll / resize after settled.
  useEffect(() => {
    if (!settled) return;
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [settled, sync]);

  // Invisible inline anchor to locate the parent wrapper.
  const anchor = (
    <span
      ref={anchorRef}
      className="absolute w-0 h-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    />
  );

  if (!settled || !rect) return anchor;

  // ── Compute fixed position ────────────────────────────────────────────

  const top =
    position === "bottom"
      ? rect.bottom + GAP
      : rect.top - GAP;

  let left: number;
  if (align === "start") {
    left = rect.left;
  } else if (align === "end") {
    left = rect.right - TOOLTIP_W;
  } else {
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  }
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - TOOLTIP_W - VIEWPORT_PAD),
  );

  // Arrow always points at the horizontal centre of the parent.
  const parentCenterX = rect.left + rect.width / 2;
  const arrowOffset = Math.max(
    20,
    Math.min(parentCenterX - left, TOOLTIP_W - 20),
  );

  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 60,
    width: TOOLTIP_W,
    top: position === "bottom" ? top : undefined,
    bottom: position === "top" ? window.innerHeight - top : undefined,
    left,
  };

  const tooltip = (
    <div
      role="status"
      aria-live="polite"
      style={style}
      className={cn("animate-scale-in", className)}
    >
      {/* Arrow (points up toward target) */}
      {position === "bottom" && (
        <div className="flex -mb-1.5" style={{ paddingLeft: arrowOffset - 6 }}>
          <div className="h-3 w-3 rotate-45 rounded-sm bg-[rgba(30,32,46,0.65)] backdrop-blur-3xl border-l border-t border-white/[0.15]" />
        </div>
      )}

      {/* Card — frosted dark glass */}
      <div
        className={cn(
          "rounded-xl p-4 shadow-xl",
          // Frosted glass: dark translucent base + strong blur + luminous border
          "border border-white/[0.15] bg-[rgba(30,32,46,0.65)] backdrop-blur-3xl",
          "shadow-black/40",
        )}
      >
        {/* Step dots + dismiss */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i < step ? "bg-white" : "bg-white/30",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 rounded-md p-0.5 text-white/40 hover:text-white transition-colors"
            aria-label="Dismiss onboarding tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-sm font-semibold text-white">
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/75">
          {description}
        </p>
      </div>

      {/* Arrow (points down toward target) */}
      {position === "top" && (
        <div className="flex -mt-1.5" style={{ paddingLeft: arrowOffset - 6 }}>
          <div className="h-3 w-3 rotate-45 rounded-sm bg-[rgba(30,32,46,0.65)] backdrop-blur-3xl border-r border-b border-white/[0.15]" />
        </div>
      )}
    </div>
  );

  return (
    <>
      {anchor}
      {createPortal(tooltip, document.body)}
    </>
  );
}
