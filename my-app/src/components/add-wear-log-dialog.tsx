"use client";

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
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
import { ContextSelect } from "@/components/context-select";
import { FormErrorBanner } from "@/components/form-error-banner";
import { FormField } from "@/components/form-field";
import { MarkdownHint } from "@/components/markdown-hint";
import { SubmitButton } from "@/components/submit-button";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { isFutureWornAtError, reportApiError } from "@/lib/utils";
import { useCtrlEnterSubmit } from "@/lib/use-ctrl-enter-submit";
import { useFormErrors } from "@/lib/use-form-errors";
import { MAX_SPRAYS } from "@/lib/constants";

function getWornAtTimestamp(date: string, time: string): number {
  if (!date) return NaN;
  if (time) return new Date(`${date}T${time}`).getTime();

  const today = new Date().toLocaleDateString("en-CA");
  if (date === today) return Date.now();

  return new Date(`${date}T12:00`).getTime();
}

interface AddWearLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleId: Id<"bottles">;
  /** Called after a wear log is successfully created. */
  onSuccess?: () => void;
}

export function AddWearLogDialog({
  open,
  onOpenChange,
  bottleId,
  onSuccess,
}: AddWearLogDialogProps) {
  const addWearLog = useMutation(api.wearLogs.addWearLog);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sprays, setSprays] = useState("3");
  const [context, setContext] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, clearError, formError, setFormError, resetErrors } = useFormErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const handleFormKeyDown = useCtrlEnterSubmit(formRef, submitting);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!date) newErrors.date = "Date is required";
    if (date) {
      const wornAt = getWornAtTimestamp(date, time);
      if (!isNaN(wornAt) && wornAt > Date.now()) {
        newErrors.wornAt = "Time cannot be in the future";
      }
    }
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

  useEffect(() => {
    if (open) {
      const now = new Date();
      setDate(now.toLocaleDateString("en-CA"));
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setSprays("3");
      setContext("");
      setRating("");
      setComment("");
      resetErrors();
    }
  }, [open, resetErrors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const wornAt = getWornAtTimestamp(date, time);
    if (isNaN(wornAt)) return;

    setSubmitting(true);
    try {
      await addWearLog({
        bottleId,
        wornAt,
        sprays: Number(sprays),
        context: context || undefined,
        rating: rating ? Number(rating) : undefined,
        comment: comment.trim() || undefined,
      });
      toast.success("Wear logged");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const message = reportApiError(err, "Failed to log wear:");
      if (isFutureWornAtError(err)) {
        setErrors({ wornAt: message });
      } else {
        toast.error(message);
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a Wear</DialogTitle>
          <DialogDescription>Record when you wore this fragrance.</DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="space-y-5"
        >
          {/* Date + Time side by side. Kept bespoke (not FormField): the wornAt
              error spans both fields, with two stacked error paragraphs and a
              switching aria-describedby. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative space-y-2">
              <Label htmlFor="date" className={errors.date || errors.wornAt ? "text-danger" : ""}>
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError("date");
                  clearError("wornAt");
                }}
                required
                className={
                  errors.date || errors.wornAt
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!(errors.date || errors.wornAt)}
                aria-describedby={errors.wornAt ? "worn-at-error" : "date-error"}
              />
              <p
                id="date-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.date && !errors.wornAt ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.date ?? " "}
              </p>
              <p
                id="worn-at-error"
                role="alert"
                className={`absolute -bottom-3 left-0 whitespace-nowrap text-xs text-danger transition-opacity ${errors.wornAt ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.wornAt ?? " "}
              </p>
            </div>
            <div className="relative space-y-2">
              <Label htmlFor="time" className={errors.wornAt ? "text-danger" : ""}>
                Time
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  clearError("wornAt");
                }}
                className={
                  errors.wornAt ? "border-danger focus:border-danger focus:ring-danger" : ""
                }
                aria-invalid={!!errors.wornAt}
                aria-describedby="worn-at-error"
              />
            </div>
          </div>

          {/* Sprays + Rating side by side */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="sprays"
              label="Sprays *"
              error={errors.sprays}
              type="number"
              value={sprays}
              onChange={(e) => {
                setSprays(e.target.value);
                clearError("sprays");
              }}
              min="1"
              max={MAX_SPRAYS}
              required
            />
            <FormField
              id="rating"
              label="Rating (1-10)"
              error={errors.rating}
              type="number"
              value={rating}
              onChange={(e) => {
                setRating(e.target.value);
                clearError("rating");
              }}
              min="1"
              max="10"
              placeholder="Optional"
            />
          </div>

          <ContextSelect value={context} onChange={setContext} />

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comment">Comments</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Performance comments, compliments received..."
              rows={2}
            />
            <MarkdownHint />
          </div>

          <DialogFooter>
            <FormErrorBanner message={formError} />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton submitting={submitting} label="Log Wear" busyLabel="Logging..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
