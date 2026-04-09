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

interface AddWearLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottleId: Id<"bottles">;
}

const CONTEXT_OPTIONS = [
  "Office",
  "Date Night",
  "Casual",
  "Formal",
  "Gym",
  "Evening Out",
  "Travel",
  "Special Occasion",
];

export function AddWearLogDialog({
  open,
  onOpenChange,
  bottleId,
}: AddWearLogDialogProps) {
  const addWearLog = useMutation(api.wearLogs.addWearLog);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sprays, setSprays] = useState("3");
  const [context, setContext] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    if (!date) newErrors.date = "Date is required";
    const spraysNum = Number(sprays);
    if (!sprays || isNaN(spraysNum) || spraysNum < 1 || spraysNum > 30) {
      newErrors.sprays = "Must be between 1 and 30";
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

    // Block plain Enter from submitting the form on non-textarea fields
    e.preventDefault();
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
        })
      );
      setSprays("3");
      setContext("");
      setRating("");
      setComment("");
      setErrors({});
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const wornAt = new Date(`${date}T${time || "12:00"}`).getTime();
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
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a Wear</DialogTitle>
          <DialogDescription>
            Record when you wore this fragrance.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-5">
          {/* Date + Time side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative space-y-2">
              <Label htmlFor="date" className={errors.date ? "text-danger" : ""}>
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError("date");
                }}
                required
                className={
                  errors.date
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!errors.date}
                aria-describedby="date-error"
              />
              <p
                id="date-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.date ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.date ?? "\u00A0"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Sprays + Rating side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative space-y-2">
              <Label htmlFor="sprays" className={errors.sprays ? "text-danger" : ""}>
                Sprays *
              </Label>
              <Input
                id="sprays"
                type="number"
                value={sprays}
                onChange={(e) => {
                  setSprays(e.target.value);
                  clearError("sprays");
                }}
                min="1"
                max="30"
                required
                className={
                  errors.sprays
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!errors.sprays}
                aria-describedby="sprays-error"
              />
              <p
                id="sprays-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.sprays ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.sprays ?? "\u00A0"}
              </p>
            </div>
            <div className="relative space-y-2">
              <Label htmlFor="rating" className={errors.rating ? "text-danger" : ""}>
                Rating (1-10)
              </Label>
              <Input
                id="rating"
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
                aria-describedby="rating-error"
              />
              <p
                id="rating-error"
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
            <Select value={context} onValueChange={setContext}>
              <SelectTrigger>
                <SelectValue placeholder="Select occasion..." />
              </SelectTrigger>
              <SelectContent>
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
            <Label htmlFor="comment">Comments</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Performance comments, compliments received..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-keyshortcuts="Control+Enter">
              <span>{submitting ? "Logging..." : "Log Wear"}</span>
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
