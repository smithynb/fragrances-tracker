"use client";

import { Doc, Id } from "../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { reportApiError } from "@/lib/utils";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { EditWearLogDialog } from "@/components/edit-wear-log-dialog";
import { MarkdownContent } from "@/components/markdown-content";
import { Droplets, Calendar, Star, MessageSquare, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatWearDate, formatWearTime } from "@/lib/format";

interface WearLogListProps {
  logs: Doc<"wearLogs">[];
}

export function WearLogList({ logs }: WearLogListProps) {
  const deleteLog = useMutation(api.wearLogs.deleteWearLog);
  const [deletingId, setDeletingId] = useState<Id<"wearLogs"> | null>(null);
  const [editingLog, setEditingLog] = useState<Doc<"wearLogs"> | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-alt flex items-center justify-center mb-3">
          <Calendar className="h-6 w-6 text-text-secondary/40" />
        </div>
        <p className="text-sm text-text-secondary">No wear logs yet</p>
        <p className="text-xs text-text-secondary/60 mt-1">Log your first wear to start tracking</p>
      </div>
    );
  }

  const handleDelete = async (logId: Id<"wearLogs">) => {
    if (deletingId !== logId) {
      setDeletingId(logId);
      return;
    }
    try {
      await deleteLog({ wearLogId: logId });
      setDeletingId(null);
    } catch (err) {
      setDeletingId(null);
      toast.error(reportApiError(err, "Failed to delete wear log:"));
    }
  };

  // Group logs by date
  const grouped = logs.reduce(
    (acc, log) => {
      const dateKey = new Date(log.wornAt).toDateString();
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(log);
      return acc;
    },
    {} as Record<string, Doc<"wearLogs">[]>,
  );

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([dateKey, dateLogs], groupIdx) => (
        <div key={dateKey}>
          {groupIdx > 0 && <Separator className="mb-5" />}
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            {formatWearDate(dateLogs[0].wornAt)}
          </p>
          <div className="space-y-3">
            {dateLogs.map((log, i) => (
              <div
                key={log._id}
                className="group flex items-start gap-3 p-4 rounded-lg border border-border/50 bg-surface hover:border-border transition-all duration-200 animate-fade-up overflow-hidden"
                style={{ animationDelay: `${(groupIdx * dateLogs.length + i) * 0.05}s` }}
              >
                {/* Timeline dot */}
                <div className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Droplets className="h-3.5 w-3.5 text-accent" />
                      <span className="font-medium text-text">
                        {log.sprays} spray{log.sprays !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <span className="text-xs text-text-secondary">
                      {formatWearTime(log.wornAt)}
                    </span>

                    {log.context && (
                      <span className="text-xs text-text-secondary bg-surface-alt px-2.5 py-1 rounded-md">
                        {log.context}
                      </span>
                    )}

                    {log.rating !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-accent">
                        <Star className="h-3 w-3 fill-current" />
                        {log.rating}/10
                      </div>
                    )}
                  </div>

                  {log.comment && (
                    <div className="flex items-start gap-1.5 mt-2 min-w-0">
                      <MessageSquare className="h-3 w-3 text-text-secondary/50 mt-0.5 shrink-0" />
                      <MarkdownContent
                        content={log.comment}
                        collapsible
                        className="text-xs text-text-secondary"
                      />
                    </div>
                  )}
                </div>

                {/* Edit + Delete */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingLog(log)}
                    className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-all duration-200 border border-white/15 bg-white/8 hover:bg-white/15"
                    aria-label="Edit wear log"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <ConfirmDeleteButton
                    confirming={deletingId === log._id}
                    onClick={() => handleDelete(log._id)}
                    onMouseLeave={() => setDeletingId(null)}
                    idleLabel="Delete wear log"
                    confirmLabel="Confirm delete wear log"
                    size="compact"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editingLog && (
        <EditWearLogDialog
          open={!!editingLog}
          onOpenChange={(open) => {
            if (!open) setEditingLog(null);
          }}
          log={editingLog}
        />
      )}
    </div>
  );
}
