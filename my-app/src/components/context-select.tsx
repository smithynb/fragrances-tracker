"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTEXT_OPTIONS, NO_CONTEXT_VALUE } from "@/lib/constants";

interface ContextSelectProps {
  /** Current context; "" means none selected. */
  value: string;
  /** Receives "" when "No context" is chosen. */
  onChange: (value: string) => void;
}

/** Labeled occasion picker shared by the add/edit wear-log dialogs. */
export function ContextSelect({ value, onChange }: ContextSelectProps) {
  return (
    <div className="space-y-2">
      <Label>Context</Label>
      <Select
        value={value || NO_CONTEXT_VALUE}
        onValueChange={(v) => onChange(v === NO_CONTEXT_VALUE ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select occasion..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CONTEXT_VALUE}>No context</SelectItem>
          {CONTEXT_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
