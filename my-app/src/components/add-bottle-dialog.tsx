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
import { FormErrorBanner } from "@/components/form-error-banner";
import { FormField } from "@/components/form-field";
import { MarkdownHint } from "@/components/markdown-hint";
import { SubmitButton } from "@/components/submit-button";
import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { reportApiError } from "@/lib/utils";
import { useCtrlEnterSubmit } from "@/lib/use-ctrl-enter-submit";
import { useFormErrors } from "@/lib/use-form-errors";

interface AddBottleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBottle?: Doc<"bottles"> | null;
}

export function AddBottleDialog({ open, onOpenChange, editBottle }: AddBottleDialogProps) {
  const addBottle = useMutation(api.bottles.addBottle);
  const updateBottle = useMutation(api.bottles.updateBottle);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [sizeMl, setSizeMl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, clearError, formError, setFormError, resetErrors } = useFormErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const handleFormKeyDown = useCtrlEnterSubmit(formRef, submitting);

  const isEditing = !!editBottle;

  useEffect(() => {
    if (open && editBottle) {
      setName(editBottle.name);
      setBrand(editBottle.brand ?? "");
      setSizeMl(editBottle.sizeMl?.toString() ?? "");
      setTags(editBottle.tags ?? []);
      setTagInput("");
      setComments(editBottle.comments ?? "");
      resetErrors();
    } else if (open) {
      setName("");
      setBrand("");
      setSizeMl("");
      setTags([]);
      setTagInput("");
      setComments("");
      resetErrors();
    }
  }, [open, editBottle, resetErrors]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Name is required";
    if (sizeMl && Number(sizeMl) < 1) newErrors.sizeMl = "Must be at least 1";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddTag = () => {
    const newTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(
        (t) => t.length > 0 && !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()),
      );
    if (newTags.length > 0) {
      setTags([...tags, ...newTags]);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      handleAddTag();
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
      const message = reportApiError(err, "Failed to save bottle:");
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
          <DialogTitle>{isEditing ? "Edit Fragrance" : "Add Fragrance"}</DialogTitle>
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
            <FormField
              id="name"
              label="Name *"
              error={errors.name}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              placeholder="Aventus"
            />
            <FormField
              id="brand"
              label="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Creed"
            />
          </div>

          {/* Size */}
          <FormField
            id="size"
            label="Size (ml)"
            error={errors.sizeMl}
            type="number"
            value={sizeMl}
            onChange={(e) => {
              setSizeMl(e.target.value);
              clearError("sizeMl");
            }}
            placeholder="100"
            min="1"
            step="1"
          />

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex items-center gap-3">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="fresh, citrus, woody..."
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
            <MarkdownHint />
          </div>

          <DialogFooter>
            <FormErrorBanner message={formError} />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton
              submitting={submitting}
              label={isEditing ? "Save Changes" : "Add Fragrance"}
              busyLabel={isEditing ? "Saving..." : "Adding..."}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
