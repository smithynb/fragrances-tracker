"use client";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

const KBD_CLASS =
  "border-white/20 bg-white/14 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.18)]";

interface SubmitButtonProps {
  submitting: boolean;
  /** Button text at rest, e.g. "Log Wear". */
  label: string;
  /** Button text while the mutation is in flight, e.g. "Logging...". */
  busyLabel: string;
}

/** Dialog submit button with the Ctrl+Enter hint chips. */
export function SubmitButton({ submitting, label, busyLabel }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={submitting} aria-keyshortcuts="Control+Enter">
      <span>{submitting ? busyLabel : label}</span>
      {!submitting && (
        <KbdGroup aria-hidden="true" className="ml-1">
          <Kbd className={KBD_CLASS}>Ctrl</Kbd>
          <span className="text-white/65">+</span>
          <Kbd className={KBD_CLASS}>⏎</Kbd>
        </KbdGroup>
      )}
    </Button>
  );
}
