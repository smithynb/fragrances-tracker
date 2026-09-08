"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { reportApiError } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Owner-only recovery surface for tombstones that reached the bounded retry
 * limit. It deliberately renders the minimal failed-deletion projection and
 * invokes the normal authenticated delete mutation for recovery.
 */
export function FailedBottleDeletions() {
  const failedDeletions = useQuery(api.bottles.listFailedBottleDeletions);
  const retryDeletion = useMutation(api.bottles.deleteBottle);
  const [retryingBottleId, setRetryingBottleId] = useState<Id<"bottles"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!failedDeletions || failedDeletions.length === 0) {
    return null;
  }

  const handleRetry = async (bottleId: Id<"bottles">) => {
    setRetryingBottleId(bottleId);
    setError(null);
    try {
      await retryDeletion({ bottleId });
      toast.success("Deletion retry started");
    } catch (err) {
      setError(reportApiError(err, "Failed to retry bottle deletion:"));
    } finally {
      setRetryingBottleId(null);
    }
  };

  return (
    <section
      aria-labelledby="failed-deletions-heading"
      className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-4"
    >
      <h2 id="failed-deletions-heading" className="text-sm font-semibold text-text">
        Deletion needs attention
      </h2>
      <p className="mt-1 text-xs text-text-secondary">
        We could not finish removing this fragrance. Retry deletion to continue cleanup.
      </p>
      <ul className="mt-3 space-y-2">
        {failedDeletions.map((failure) => {
          const isRetrying = retryingBottleId === failure._id;
          return (
            <li key={failure._id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-text">{failure.name}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRetrying}
                onClick={() => void handleRetry(failure._id)}
                aria-label={`Retry deletion for ${failure.name}`}
              >
                {isRetrying ? "Retrying…" : "Retry deletion"}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
