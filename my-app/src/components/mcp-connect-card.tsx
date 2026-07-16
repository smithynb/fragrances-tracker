"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function McpConnectCard() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const mcpUrl = base + "/api/mcp";

  return (
    <section>
      <h2 className="font-display text-lg text-text">Connect an AI assistant</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Add your collection to Claude, ChatGPT, or Codex as an MCP server.
      </p>

      <div className="mt-4 flex items-start gap-2">
        <code className="block min-w-0 flex-1 break-all rounded-lg border border-border/40 bg-surface-alt px-3 py-2 text-xs">
          {mcpUrl}
        </code>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            void navigator.clipboard.writeText(mcpUrl);
            toast.success("Copied to clipboard.");
          }}
        >
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
        <li>In your AI client, add a new MCP server / connector.</li>
        <li>Paste the URL above.</li>
        <li>Sign in and approve access on the consent screen.</li>
      </ol>
    </section>
  );
}
