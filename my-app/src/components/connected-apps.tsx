// src/components/connected-apps.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { formatWearDate } from "@/lib/format";

export function ConnectedApps() {
  const grants = useQuery(api.oauth.listGrants);
  const revokeGrant = useMutation(api.oauth.revokeGrant);
  const [confirmingId, setConfirmingId] = useState<Id<"oauthGrants"> | null>(null);

  const handleRevoke = async (grantId: Id<"oauthGrants">, clientName: string) => {
    if (confirmingId !== grantId) {
      setConfirmingId(grantId);
      return;
    }
    setConfirmingId(null);
    try {
      await revokeGrant({ grantId });
      toast.success(`Disconnected ${clientName}.`);
    } catch {
      toast.error("Could not revoke access. Please try again.");
    }
  };

  return (
    <section>
      <h2 className="font-display text-lg text-text">Connected apps</h2>
      <p className="mt-1 text-sm text-text-secondary">
        AI agents you have granted access to via OAuth. Revoking stops new requests within 15
        minutes (until their current token expires).
      </p>
      {grants === undefined ? (
        <p className="mt-4 text-sm text-text-secondary">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border/40 bg-surface/60 px-4 py-3 text-sm text-text-secondary">
          No connected apps yet.
        </p>
      ) : (
        <ul className="mt-4 max-h-80 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/40 bg-surface/60">
          {grants.map((grant) => (
            <li key={grant._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{grant.clientName}</p>
                <p className="text-xs text-text-secondary">
                  Connected {formatWearDate(grant.createdAt)}
                  {grant.lastUsedAt ? ` · Last used ${formatWearDate(grant.lastUsedAt)}` : ""}
                </p>
              </div>
              <ConfirmDeleteButton
                confirming={confirmingId === grant._id}
                onClick={() => void handleRevoke(grant._id, grant.clientName)}
                onMouseLeave={() => setConfirmingId(null)}
                idleLabel={`Revoke ${grant.clientName}`}
                confirmLabel="Confirm revoke"
                size="compact"
                className="border"
                idleClassName="border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                confirmingClassName="border-transparent"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
