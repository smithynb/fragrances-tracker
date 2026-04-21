"use client";

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/utils";
import { MAX_SPRAYS, CONTEXT_OPTIONS } from "@/lib/constants";

const NO_CONTEXT_VALUE = "__none__";

interface EditWearLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: Doc<"wearLogs">;
}

export function EditWearLogDialog({
  open,
  onOpenChange,
  log,
}: EditWearLogDialogProps) {
  const updateWearLog = useMutation(api.wearLogs.updateWearLog);

  const [sprays, setSprays] = useState("");
  const [context, setContext] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const spraysNum = Number(sprays);
    if (!sprays || isNaN(spraysNum) || spraysNum < 1 || spraysNum > MAX_SPRAYS) {
      newErrors.sprays = `Must be between 1 and ${MAX_SPRAYS}`;
    }
    if (rating) {
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10) {
        newErrors.rating = "Must be between 1 and 10";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;

    // Allow plain Enter in textareas (for newlines)
    if ((e.target as HTMLElement).tagName === "TEXTAREA" && !e.ctrlKey) return;

    // Ctrl+Enter: submit the form
    if (e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (submitting) return;
      e.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }

    // Block plain Enter from submitting the form only on text/number inputs.
    if ((e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
    }
  };

  // Pre-populate form fields from the log when the dialog opens
  useEffect(() => {
    if (open) {
      setSprays(String(log.sprays));
      setContext(log.context ?? "");
      setRating(log.rating !== undefined ? String(log.rating) : "");
      setComment(log.comment ?? "");
      setErrors({});
      setFormError(null);
    }
  }, [open, log]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await updateWearLog({
        wearLogId: log._id,
        sprays: Number(sprays),
        context: context || null,
        rating: rating ? Number(rating) : null,
        comment: comment.trim() || null,
      });
      toast.success("Wear log updated");
      onOpenChange(false);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to update wear log:", err);
      }
      const message = getApiErrorMessage(err);
      toast.error(message);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatReadOnlyDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year:
        d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  const formatReadOnlyTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Wear Log</DialogTitle>
          <DialogDescription>
            Update your notes for this wear.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="space-y-5">
          {/* Read-only date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-text-secondary/60">Date</Label>
              <div className="flex h-10 w-full items-center rounded-xl border border-border/40 bg-surface-alt/50 px-4 text-sm text-text-secondary/60 select-none cursor-not-allowed">
                {formatReadOnlyDate(log.wornAt)}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-text-secondary/60">Time</Label>
              <div className="flex h-10 w-full items-center rounded-xl border border-border/40 bg-surface-alt/50 px-4 text-sm text-text-secondary/60 select-none cursor-not-allowed">
                {formatReadOnlyTime(log.wornAt)}
              </div>
            </div>
          </div>

          {/* Sprays + Rating side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative space-y-2">
              <Label htmlFor="edit-sprays" className={errors.sprays ? "text-danger" : ""}>
                Sprays *
              </Label>
              <Input
                id="edit-sprays"
                type="number"
                value={sprays}
                onChange={(e) => {
                  setSprays(e.target.value);
                  clearError("sprays");
                }}
                min="1"
                max={MAX_SPRAYS}
                required
                className={
                  errors.sprays
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!errors.sprays}
                aria-describedby="edit-sprays-error"
              />
              <p
                id="edit-sprays-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.sprays ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.sprays ?? "\u00A0"}
              </p>
            </div>
            <div className="relative space-y-2">
              <Label htmlFor="edit-rating" className={errors.rating ? "text-danger" : ""}>
                Rating (1-10)
              </Label>
              <Input
                id="edit-rating"
                type="number"
                value={rating}
                onChange={(e) => {
                  setRating(e.target.value);
                  clearError("rating");
                }}
                min="1"
                max="10"
                placeholder="Optional"
                className={
                  errors.rating
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!errors.rating}
                aria-describedby="edit-rating-error"
              />
              <p
                id="edit-rating-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.rating ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.rating ?? "\u00A0"}
              </p>
            </div>
          </div>

          {/* Context */}
          <div className="space-y-2">
            <Label>Context</Label>
            <Select
              value={context || NO_CONTEXT_VALUE}
              onValueChange={(value) =>
                setContext(value === NO_CONTEXT_VALUE ? "" : value)
              }
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

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="edit-comment">Comments</Label>
            <Textarea
              id="edit-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Performance comments, compliments received..."
              rows={2}
            />
          </div>

          <DialogFooter>
            {formError && (
              <p role="alert" className="w-full rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                {formError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-keyshortcuts="Control+Enter">
              <span>{submitting ? "Saving..." : "Save Changes"}</span>
              {!submitting && (
                <KbdGroup aria-hidden="true" className="ml-1">
                  <Kbd className="border-white/20 bg-white/14 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.18)]">
                    Ctrl
                  </Kbd>
                  <span className="text-white/65">+</span>
                  <Kbd className="border-white/20 bg-white/14 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.18)]">
                    ⏎
                  </Kbd>
                </KbdGroup>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
