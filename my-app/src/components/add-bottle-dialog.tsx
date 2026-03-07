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
    } else if (open) {
      setName("");
      setBrand("");
      setSizeMl("");
      setTags([]);
      setTagInput("");
      setComments("");
    }
  }, [open, editBottle]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
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
    if (e.key !== "Enter" || !e.ctrlKey || e.shiftKey || e.metaKey) return;
    if (!name.trim() || submitting) return;

    e.preventDefault();
    formRef.current?.requestSubmit();
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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
      } else {
        await addBottle({
          name: name.trim(),
          brand: brand.trim() || undefined,
          sizeMl: sizeMl ? Number(sizeMl) : undefined,
          tags: tags.length > 0 ? tags : undefined,
          comments: comments.trim() || undefined,
        });
      }
      onOpenChange(false);
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
          <DialogDescription>
            {isEditing
              ? "Update the details of your fragrance."
              : "Add a new fragrance to your collection."}
          </DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="space-y-5"
        >
          {/* Name + Brand side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aventus"
                required
              />
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
          <div className="space-y-2">
            <Label htmlFor="size">Size (ml)</Label>
            <Input
              id="size"
              type="number"
              value={sizeMl}
              onChange={(e) => setSizeMl(e.target.value)}
              placeholder="100"
              min="1"
              step="1"
            />
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
            <Label htmlFor="comments">Notes</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Personal thoughts, batch code, where purchased..."
              rows={3}
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
            <Button
              type="submit"
              disabled={!name.trim() || submitting}
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
