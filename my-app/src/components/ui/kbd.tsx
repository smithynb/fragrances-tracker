import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border/80 bg-surface-alt px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary shadow-[inset_0_-1px_0_rgba(44,38,34,0.08)]",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
