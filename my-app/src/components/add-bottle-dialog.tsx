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
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/utils";

interface AddBottleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBottle?: Doc<"bottles"> | null;
}

export function AddBottleDialog({
  open,
  onOpenChange,
  editBottle,
}: AddBottleDialogProps) {
  const addBottle = useMutation(api.bottles.addBottle);
  const updateBottle = useMutation(api.bottles.updateBottle);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [sizeMl, setSizeMl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isEditing = !!editBottle;

  useEffect(() => {
    if (open && editBottle) {
      setName(editBottle.name);
      setBrand(editBottle.brand ?? "");
      setSizeMl(editBottle.sizeMl?.toString() ?? "");
      setTags(editBottle.tags ?? []);
      setTagInput("");
      setComments(editBottle.comments ?? "");
      setErrors({});
      setFormError(null);
    } else if (open) {
      setName("");
      setBrand("");
      setSizeMl("");
      setTags([]);
      setTagInput("");
      setComments("");
      setErrors({});
      setFormError(null);
    }
  }, [open, editBottle]);

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
    if (!name.trim()) newErrors.name = "Name is required";
    if (sizeMl && Number(sizeMl) < 1) newErrors.sizeMl = "Must be at least 1";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      handleAddTag();
    }
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
    // Buttons, Select triggers, and other interactive controls are left
    // unaffected so keyboard users can activate them normally.
    if ((e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEditing && editBottle) {
        await updateBottle({
          bottleId: editBottle._id,
          name: name.trim(),
          brand: brand.trim() || null,
          sizeMl: sizeMl ? Number(sizeMl) : null,
          tags: tags.length > 0 ? tags : null,
          comments: comments.trim() || null,
        });
        toast.success("Fragrance updated");
      } else {
        await addBottle({
          name: name.trim(),
          brand: brand.trim() || undefined,
          sizeMl: sizeMl ? Number(sizeMl) : undefined,
          tags: tags.length > 0 ? tags : undefined,
          comments: comments.trim() || undefined,
        });
        toast.success("Fragrance added");
      }
      onOpenChange(false);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to save bottle:", err);
      }
      const message = getApiErrorMessage(err);
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
          <DialogTitle>
            {isEditing ? "Edit Fragrance" : "Add Fragrance"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? "Edit fragrance form" : "Add fragrance form"}
          </DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="space-y-5"
        >
          {/* Name + Brand side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative space-y-2">
              <Label htmlFor="name" className={errors.name ? "text-danger" : ""}>
                Name *
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearError("name");
                }}
                placeholder="Aventus"
                className={
                  errors.name
                    ? "border-danger focus:border-danger focus:ring-danger"
                    : ""
                }
                aria-invalid={!!errors.name}
                aria-describedby="name-error"
              />
              <p
                id="name-error"
                role="alert"
                className={`absolute -bottom-3 left-0 text-xs text-danger transition-opacity ${errors.name ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {errors.name ?? "\u00A0"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Creed"
              />
            </div>
          </div>

          {/* Size */}
          <div className="relative space-y-2">
            <Label htmlFor="size" className={errors.sizeMl ? "text-danger" : ""}>
              Size (ml)
            </Label>
            <Input
              id="size"
              type="number"
              value={sizeMl}
              onChange={(e) => {
                setSizeMl(e.target.value);
                clearError("sizeMl");
              }}
              placeholder="100"
              min="1"
              step="1"
              className={
                errors.sizeMl
                  ? "border-danger focus:border-danger focus:ring-danger"
                  : ""
              }
              aria-invalid={!!errors.sizeMl}
              aria-describedby="size-error"
            />
            <p
              id="size-error"
              role="alert"
              className={`absolute top-full left-0 mt-1 text-xs text-danger transition-opacity ${errors.sizeMl ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              {errors.sizeMl ?? "\u00A0"}
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex items-center gap-3">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type and press Enter"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 text-xs bg-accent-subtle text-accent-hover border border-border/50 rounded-full px-3 py-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="hover:text-danger transition-colors cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Personal thoughts, batch code, where purchased..."
              rows={3}
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
            <Button
              type="submit"
              disabled={submitting}
              aria-keyshortcuts="Control+Enter"
            >
              <span>
                {submitting
                  ? isEditing
                    ? "Saving..."
                    : "Adding..."
                  : isEditing
                    ? "Save Changes"
                    : "Add Fragrance"}
              </span>
              {!submitting && (
                <KbdGroup
                  aria-hidden="true"
                  className="ml-1"
                >
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
