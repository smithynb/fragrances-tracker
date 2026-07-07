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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ContextSelect } from "@/components/context-select";
import { FormErrorBanner } from "@/components/form-error-banner";
import { FormField } from "@/components/form-field";
import { MarkdownHint } from "@/components/markdown-hint";
import { SubmitButton } from "@/components/submit-button";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { reportApiError } from "@/lib/utils";
import { useCtrlEnterSubmit } from "@/lib/use-ctrl-enter-submit";
import { useFormErrors } from "@/lib/use-form-errors";
import { formatWearDate, formatWearTime } from "@/lib/format";
import { MAX_SPRAYS } from "@/lib/constants";

interface EditWearLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: Doc<"wearLogs">;
}

export function EditWearLogDialog({ open, onOpenChange, log }: EditWearLogDialogProps) {
  const updateWearLog = useMutation(api.wearLogs.updateWearLog);

  const [sprays, setSprays] = useState("");
  const [context, setContext] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, clearError, formError, setFormError, resetErrors } = useFormErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const handleFormKeyDown = useCtrlEnterSubmit(formRef, submitting);

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

  // Pre-populate form fields from the log when the dialog opens
  useEffect(() => {
    if (open) {
      setSprays(String(log.sprays));
      setContext(log.context ?? "");
      setRating(log.rating !== undefined ? String(log.rating) : "");
      setComment(log.comment ?? "");
      resetErrors();
    }
  }, [open, log, resetErrors]);

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
      const message = reportApiError(err, "Failed to update wear log:");
      toast.error(message);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Wear Log</DialogTitle>
          <DialogDescription>Update your notes for this wear.</DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="space-y-5"
        >
          {/* Read-only date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-text-secondary/60">Date</Label>
              <div className="flex h-10 w-full items-center rounded-xl border border-border/40 bg-surface-alt/50 px-4 text-sm text-text-secondary/60 select-none cursor-not-allowed">
                {formatWearDate(log.wornAt, { weekday: true })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-text-secondary/60">Time</Label>
              <div className="flex h-10 w-full items-center rounded-xl border border-border/40 bg-surface-alt/50 px-4 text-sm text-text-secondary/60 select-none cursor-not-allowed">
                {formatWearTime(log.wornAt)}
              </div>
            </div>
          </div>

          {/* Sprays + Rating side by side */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="edit-sprays"
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
              id="edit-rating"
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
            <Label htmlFor="edit-comment">Comments</Label>
            <Textarea
              id="edit-comment"
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
            <SubmitButton submitting={submitting} label="Save Changes" busyLabel="Saving..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
