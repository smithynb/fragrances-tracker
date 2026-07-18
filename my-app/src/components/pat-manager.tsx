// src/components/pat-manager.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { formatWearDate } from "@/lib/format";
import { PAT_PREFIX, randomToken, sha256Hex } from "@/lib/mcp/tokens";

export function PatManager() {
  const tokens = useQuery(api.apiTokens.list);
  const createToken = useMutation(api.apiTokens.create);
  const revokeToken = useMutation(api.apiTokens.revoke);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<Id<"personalAccessTokens"> | null>(null);

  const handleCreate = async () => {
    if (name.trim().length === 0) return;
    setIsCreating(true);
    try {
      // Raw token never leaves the browser; Convex stores only the hash.
      const raw = PAT_PREFIX + randomToken();
      await createToken({ tokenHash: await sha256Hex(raw), name: name.trim() });
      setRawToken(raw);
    } catch {
      toast.error("Could not create the token. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setName("");
      setRawToken(null);
    }
  };

  const handleRevoke = async (tokenId: Id<"personalAccessTokens">) => {
    if (confirmingId !== tokenId) {
      setConfirmingId(tokenId);
      return;
    }
    setConfirmingId(null);
    try {
      await revokeToken({ tokenId });
      toast.success("Token revoked.");
    } catch {
      toast.error("Could not revoke the token. Please try again.");
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-text">API tokens</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Personal access tokens for CLI clients (Claude Code, curl). Sent as{" "}
            <code className="text-xs">Authorization: Bearer fgt_…</code>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Create token
            </Button>
          </DialogTrigger>
          <DialogContent>
            {rawToken === null ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create API token</DialogTitle>
                  <DialogDescription>
                    Name it after the client that will use it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="pat-name">Token name</Label>
                  <Input
                    id="pat-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Claude Code on laptop"
                  />
                </div>
                <Button onClick={() => void handleCreate()} disabled={isCreating || name.trim() === ""}>
                  Create
                </Button>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Copy your token now</DialogTitle>
                  <DialogDescription>
                    This is the only time it will be shown. Store it like a password.
                  </DialogDescription>
                </DialogHeader>
                <code
                  data-testid="raw-token"
                  className="block break-all rounded-lg border border-border/40 bg-surface-alt px-3 py-2 text-xs"
                >
                  {rawToken}
                </code>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(rawToken);
                    toast.success("Copied to clipboard.");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {tokens === undefined ? (
        <p className="mt-4 text-sm text-text-secondary">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border/40 bg-surface/60 px-4 py-3 text-sm text-text-secondary">
          No API tokens yet.
        </p>
      ) : (
        <ul className="mt-4 max-h-64 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/40 bg-surface/60">
          {tokens.map((token) => (
            <li key={token._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{token.name}</p>
                <p className="text-xs text-text-secondary">
                  Created {formatWearDate(token.createdAt)}
                  {token.lastUsedAt ? ` · Last used ${formatWearDate(token.lastUsedAt)}` : " · Never used"}
                </p>
              </div>
              <ConfirmDeleteButton
                confirming={confirmingId === token._id}
                onClick={() => void handleRevoke(token._id)}
                onMouseLeave={() => setConfirmingId(null)}
                idleLabel={`Revoke ${token.name}`}
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
