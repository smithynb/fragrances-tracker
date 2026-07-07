"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** Validation error; when set, label/input/message render in the danger state. */
  error?: string;
}

/**
 * Labeled input with a reserved, absolutely-positioned error line beneath it
 * (`role="alert"`, id `` `${id}-error` ``), matching the dialog form styling.
 */
export function FormField({ id, label, error, className, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="relative space-y-2">
      <Label htmlFor={id} className={error ? "text-danger" : ""}>
        {label}
      </Label>
      <Input
        id={id}
        className={cn(error && "border-danger focus:border-danger focus:ring-danger", className)}
        aria-invalid={!!error}
        aria-describedby={errorId}
        {...inputProps}
      />
      <p
        id={errorId}
        role="alert"
        className={cn(
          "absolute -bottom-3 left-0 text-xs text-danger transition-opacity",
          error ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {error ?? " "}
      </p>
    </div>
  );
}
