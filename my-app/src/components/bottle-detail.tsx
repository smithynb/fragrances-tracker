"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { WearLogList } from "@/components/wear-log-list";
import {
  Pencil,
  Trash2,
  Plus,
  Droplets,
  Calendar,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import { useState } from "react";

interface BottleDetailProps {
  bottleId: Id<"bottles">;
  onEdit: () => void;
  onAddWearLog: () => void;
  onClose: () => void;
}

export function BottleDetail({
  bottleId,
  onEdit,
  onAddWearLog,
  onClose,
}: BottleDetailProps) {
  const bottle = useQuery(api.bottles.getBottle, { bottleId });
  const logs = useQuery(api.wearLogs.listWearLogsByBottle, { bottleId });
  const deleteBottle = useMutation(api.bottles.deleteBottle);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (bottle === undefined) {
    return (
      <div className="flex flex-col gap-4 p-6 animate-shimmer">
        <div className="h-8 w-48 rounded-lg bg-surface-alt" />
        <div className="h-4 w-32 rounded bg-surface-alt" />
        <div className="h-20 rounded-xl bg-surface-alt" />
      </div>
    );
  }

  if (bottle === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6">
        <p className="text-text-secondary">Fragrance not found</p>
      </div>
    );
  }

  const totalSprays = logs?.reduce((sum, l) => sum + l.sprays, 0) ?? 0;
  const totalWears = logs?.length ?? 0;
  const ratedLogs = logs?.filter((l) => l.rating !== undefined) ?? [];
  const avgRating =
    ratedLogs.length > 0
      ? (
          ratedLogs.reduce((sum, l) => sum + (l.rating as number), 0) /
          ratedLogs.length
        ).toFixed(1)
      : null;

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteBottle({ bottleId });
    onClose();
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Mobile back button */}
      <div className="flex items-center gap-2 px-7 pt-4 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Header */}
      <div className="px-7 pt-6 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold text-text leading-tight">
              {bottle.name}
            </h2>
            {bottle.brand && (
              <p className="text-sm text-text-secondary mt-1.5">{bottle.brand}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant={confirmDelete ? "destructive" : "ghost"}
              onClick={handleDelete}
              onMouseLeave={() => setConfirmDelete(false)}
              className={cn(
                "h-10 transition-all duration-300 ease-out shrink-0 overflow-hidden relative",
                confirmDelete ? "w-[116px] px-4" : "w-10 px-0 justify-center"
              )}
            >
              <Trash2 className="h-4 w-4 shrink-0 z-10" />
              <span
                className={cn(
                  "overflow-hidden transition-all duration-300 ease-out whitespace-nowrap text-sm flex items-center z-10",
                  confirmDelete ? "w-[60px] ml-1.5 opacity-100" : "w-0 ml-0 opacity-0"
                )}
              >
                Confirm
              </span>
            </Button>
          </div>
        </div>

        {/* Tags */}
        {bottle.tags && bottle.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {bottle.tags.map((tag) => (
              <Badge key={tag} variant="tag">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-5 mt-5">
          {bottle.sizeMl && (
            <div className="flex items-center gap-1.5 text-sm text-text-secondary">
              <Droplets className="h-4 w-4" />
              {bottle.sizeMl}ml
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Calendar className="h-4 w-4" />
            {totalWears} wear{totalWears !== 1 ? "s" : ""}
          </div>
          {totalSprays > 0 && (
            <div className="text-sm text-text-secondary">
              {totalSprays} total sprays
            </div>
          )}
          {avgRating && (
            <div className="text-sm text-accent font-medium">
              {avgRating}/10 avg
            </div>
          )}
        </div>

        {/* Comments */}
        {bottle.comments && (
          <div className="flex items-start gap-2.5 mt-5 p-4 rounded-lg bg-surface-alt">
            <MessageSquare className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" />
            <p className="text-sm text-text-secondary leading-relaxed">
              {bottle.comments}
            </p>
          </div>
        )}
      </div>

      <div className="px-7 py-4">
        <Separator />
      </div>

      {/* Wear log section */}
      <div className="flex items-center justify-between px-7 pb-3">
        <h3 className="font-display text-lg font-semibold text-text">
          Wear History
        </h3>
        <Button onClick={onAddWearLog} size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Log Wear
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-fade px-7 pb-7">
        <WearLogList logs={logs ?? []} />
      </div>
    </div>
  );
}
