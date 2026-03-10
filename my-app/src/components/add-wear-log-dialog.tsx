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
import { useState, useEffect } from "react";

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
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !sprays) return;

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
      onOpenChange(false);
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Date + Time side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
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
            <div className="space-y-2">
              <Label htmlFor="sprays">Sprays *</Label>
              <Input
                id="sprays"
                type="number"
                value={sprays}
                onChange={(e) => setSprays(e.target.value)}
                min="1"
                max="30"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Rating (1-10)</Label>
              <Input
                id="rating"
                type="number"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                min="1"
                max="10"
                placeholder="Optional"
              />
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
            <Button type="submit" disabled={!date || !sprays || submitting}>
              {submitting ? "Logging..." : "Log Wear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
