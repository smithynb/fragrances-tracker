"use client";

import { useAuth } from "@clerk/nextjs";
import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottleCollection } from "@/components/bottle-collection";
import { BottleDetail } from "@/components/bottle-detail";
import { AddBottleDialog } from "@/components/add-bottle-dialog";
import { AddWearLogDialog } from "@/components/add-wear-log-dialog";
import { Wine } from "lucide-react";

type ConvexTokenStatus =
  | { state: "idle" }
  | { state: "ready"; sessionId: string }
  | { state: "missing"; sessionId: string; reason?: string };

export function HomePage() {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const [convexTokenStatus, setConvexTokenStatus] = useState<ConvexTokenStatus>(
    { state: "idle" }
  );

  useEffect(() => {
    let isActive = true;

    if (!isSignedIn || !sessionId) {
      return () => {
        isActive = false;
      };
    }

    const activeSessionId = sessionId;

    async function checkConvexToken() {
      try {
        const token = await getToken({ template: "convex", skipCache: true });

        if (!isActive) return;

        setConvexTokenStatus(
          token
            ? { state: "ready", sessionId: activeSessionId }
            : { state: "missing", sessionId: activeSessionId }
        );
      } catch (error) {
        if (!isActive) return;

        setConvexTokenStatus({
          state: "missing",
          sessionId: activeSessionId,
          reason: error instanceof Error ? error.message : undefined,
        });
      }
    }

    void checkConvexToken();

    return () => {
      isActive = false;
    };
  }, [getToken, isSignedIn, sessionId]);

  const hasCheckedCurrentSession =
    sessionId !== null &&
    convexTokenStatus.state !== "idle" &&
    convexTokenStatus.sessionId === sessionId;

  const isCheckingConvexToken = isSignedIn && !hasCheckedCurrentSession;

  if (!isLoaded) {
    return (
      <AuthStateShell>
        <div className="animate-fade-in rounded-[2rem] border border-border/60 bg-surface px-8 py-10 text-center shadow-lg shadow-black/5 dark:shadow-black/20">
          <p className="text-sm text-text-secondary">Checking your session...</p>
        </div>
      </AuthStateShell>
    );
  }

  if (!isSignedIn) {
    return (
      <AuthStateShell>
        <div className="animate-fade-up rounded-[2rem] border border-border/60 bg-surface/90 px-8 py-10 text-center shadow-xl shadow-black/5 backdrop-blur dark:shadow-black/20">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-alt">
            <Wine className="h-10 w-10 text-text-secondary/40" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-text">
            Fragrance Tracker
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">
            Sign in or create an account from the top-right controls to load
            your collection, wear history, and personal stats.
          </p>
        </div>
      </AuthStateShell>
    );
  }

  if (isCheckingConvexToken) {
    return (
      <AuthStateShell>
        <div className="animate-fade-in rounded-[2rem] border border-border/60 bg-surface px-8 py-10 text-center shadow-lg shadow-black/5 dark:shadow-black/20">
          <p className="text-sm text-text-secondary">
            Connecting your secure data session...
          </p>
        </div>
      </AuthStateShell>
    );
  }

  if (convexTokenStatus.state === "missing") {
    const debugReason =
      process.env.NODE_ENV === "development" ? convexTokenStatus.reason : null;

    return (
      <AuthStateShell>
        <div className="animate-fade-up rounded-[2rem] border border-border/60 bg-surface/90 px-8 py-10 text-center shadow-xl shadow-black/5 backdrop-blur dark:shadow-black/20">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-alt">
            <Wine className="h-10 w-10 text-text-secondary/40" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-text">
            Finish Convex auth setup
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
            Clerk signed you in, but Convex rejected the session. Create a
            Clerk JWT template named{" "}
            <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text">
              convex
            </code>{" "}
            and set{" "}
            <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text">
              CLERK_JWT_ISSUER_DOMAIN
            </code>{" "}
            in the Convex environment to the issuer for this Clerk instance. A
            Clerk development instance is fine; this does not require Clerk
            production.
          </p>
          {debugReason && (
            <p className="mt-4 text-xs leading-5 text-text-secondary/80">
              Clerk response: {debugReason}
            </p>
          )}
        </div>
      </AuthStateShell>
    );
  }

  return <AuthenticatedHomePage />;
}

function AuthStateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex flex-1 items-center justify-center p-8">
        {children}
      </div>

      <div className="fixed bottom-5 right-5 z-50 animate-fade-in stagger-4">
        <ThemeToggle />
      </div>
    </div>
  );
}

function AuthenticatedHomePage() {
  const [selectedBottleId, setSelectedBottleId] =
    useState<Id<"bottles"> | null>(null);
  const [addBottleOpen, setAddBottleOpen] = useState(false);
  const [editBottle, setEditBottle] = useState<Doc<"bottles"> | null>(null);
  const [addWearLogOpen, setAddWearLogOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selectedBottle = useQuery(
    api.bottles.getBottle,
    selectedBottleId ? { bottleId: selectedBottleId } : "skip"
  );

  const handleSelectBottle = (id: Id<"bottles">) => {
    setSelectedBottleId(id);
    setMobileDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setSelectedBottleId(null);
    setMobileDetailOpen(false);
  };

  const handleEditBottle = () => {
    if (selectedBottle) {
      setEditBottle(selectedBottle);
      setAddBottleOpen(true);
    }
  };

  const handleCloseBottleDialog = (open: boolean) => {
    setAddBottleOpen(open);
    if (!open) setEditBottle(null);
  };

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex flex-1 overflow-hidden">
        <div
          className={`w-full lg:w-[480px] xl:w-[540px] border-r border-border/40 bg-bg flex flex-col shrink-0 px-6 lg:px-7 ${
            mobileDetailOpen ? "hidden lg:flex" : "flex"
          }`}
        >
          <BottleCollection
            selectedBottleId={selectedBottleId}
            onSelectBottle={handleSelectBottle}
            onAddBottle={() => setAddBottleOpen(true)}
          />
        </div>

        <div
          className={`flex-1 bg-surface overflow-hidden ${
            mobileDetailOpen ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          }`}
        >
          {selectedBottleId ? (
            <BottleDetail
              key={selectedBottleId}
              bottleId={selectedBottleId}
              onEdit={handleEditBottle}
              onAddWearLog={() => setAddWearLogOpen(true)}
              onClose={handleCloseDetail}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center animate-fade-in p-8">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-alt">
                <Wine className="h-10 w-10 text-text-secondary/30" />
              </div>
              <h3 className="mb-2 font-display text-xl font-semibold text-text-secondary/60">
                Select a fragrance
              </h3>
              <p className="text-sm text-text-secondary/40">
                Choose from your collection to view details
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-5 right-5 z-50 animate-fade-in stagger-4">
        <ThemeToggle />
      </div>

      <AddBottleDialog
        open={addBottleOpen}
        onOpenChange={handleCloseBottleDialog}
        editBottle={editBottle}
      />

      {selectedBottleId && (
        <AddWearLogDialog
          open={addWearLogOpen}
          onOpenChange={setAddWearLogOpen}
          bottleId={selectedBottleId}
        />
      )}
    </div>
  );
}
