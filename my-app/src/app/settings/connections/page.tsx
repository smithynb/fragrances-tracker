// src/app/settings/connections/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConnectedApps } from "@/components/connected-apps";
import { PatManager } from "@/components/pat-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Connections",
};

export default function ConnectionsPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" aria-label="Back to collection">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-2xl tracking-tight text-text">Connections</h1>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Manage AI agents and API tokens that can access your collection via MCP.
        </p>
        <div className="mt-8 space-y-10">
          <ConnectedApps />
          <PatManager />
        </div>
      </div>
    </main>
  );
}
