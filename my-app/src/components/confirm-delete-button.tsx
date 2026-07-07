"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZES = {
  /** Bottle-detail header action (h-10 icon button). */
  default: {
    button: "h-10",
    expanded: "w-[116px] px-4",
    collapsed: "w-10 px-0 justify-center",
    icon: "h-4 w-4",
    text: "text-sm",
    confirmText: "w-[60px]",
  },
  /** Wear-log row action (h-8 icon button). */
  compact: {
    button: "h-8",
    expanded: "w-[100px] px-3",
    collapsed: "w-8 px-0 justify-center",
    icon: "h-3.5 w-3.5",
    text: "text-xs",
    confirmText: "w-[56px]",
  },
} as const;

interface ConfirmDeleteButtonProps {
  /** Armed by the parent on first click; second click confirms. */
  confirming: boolean;
  onClick: () => void;
  /** Parent resets its armed state here. */
  onMouseLeave: () => void;
  idleLabel: string;
  confirmLabel: string;
  size?: keyof typeof SIZES;
  /** Extra classes applied in both states (e.g. hover-reveal opacity). */
  className?: string;
  /** Extra classes applied only at rest (e.g. red outline styling). */
  idleClassName?: string;
  /** Extra classes applied only while armed. */
  confirmingClassName?: string;
}

/**
 * Two-step delete button: an icon at rest that expands to reveal a "Confirm"
 * label once armed. Mousing away should disarm it via onMouseLeave.
 */
export function ConfirmDeleteButton({
  confirming,
  onClick,
  onMouseLeave,
  idleLabel,
  confirmLabel,
  size = "default",
  className,
  idleClassName,
  confirmingClassName,
}: ConfirmDeleteButtonProps) {
  const s = SIZES[size];
  return (
    <Button
      variant={confirming ? "destructive" : "ghost"}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
      aria-label={confirming ? confirmLabel : idleLabel}
      className={cn(
        "transition-all duration-300 ease-out shrink-0 overflow-hidden relative gap-0",
        s.button,
        confirming ? cn(s.expanded, confirmingClassName) : cn(s.collapsed, idleClassName),
        className,
      )}
    >
      <Trash2 className={cn(s.icon, "shrink-0 z-10")} />
      <span
        aria-hidden={!confirming}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out whitespace-nowrap flex items-center z-10",
          s.text,
          confirming ? cn(s.confirmText, "ml-1.5 opacity-100") : "w-0 ml-0 opacity-0",
        )}
      >
        Confirm
      </span>
    </Button>
  );
}
