"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottleCollection } from "@/components/bottle-collection";
import { BottleDetail } from "@/components/bottle-detail";
import { AddBottleDialog } from "@/components/add-bottle-dialog";
import { AddWearLogDialog } from "@/components/add-wear-log-dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, LogOut, Wine } from "lucide-react";

export function HomePage() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [selectedBottleId, setSelectedBottleId] =
    useState<Id<"bottles"> | null>(null);
  const [addBottleOpen, setAddBottleOpen] = useState(false);
  const [editBottle, setEditBottle] = useState<Doc<"bottles"> | null>(null);
  const [addWearLogOpen, setAddWearLogOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const currentUser = useQuery(api.users.currentUser);

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

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSelectedBottleId(null);
    setMobileDetailOpen(false);
    setAddWearLogOpen(false);
    setAddBottleOpen(false);
    setEditBottle(null);

    try {
      await signOut();
      router.replace("/signin");
    } finally {
      setIsSigningOut(false);
    }
  };

  const userLabel =
    currentUser?.name ?? currentUser?.email ?? "Signed in with Google";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-bg/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold text-text">
            Fragrance Tracker
          </p>
          <p className="truncate text-sm text-text-secondary">{userLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            className="gap-2"
          >
            {isSigningOut ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Sign out
          </Button>
        </div>
      </header>

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
            <div className="flex flex-col items-center justify-center h-full animate-fade-in p-8">
              <div className="w-20 h-20 rounded-2xl bg-surface-alt flex items-center justify-center mb-6">
                <Wine className="h-10 w-10 text-text-secondary/30" />
              </div>
              <h3 className="font-display text-xl font-semibold text-text-secondary/60 mb-2">
                Select a fragrance
              </h3>
              <p className="text-sm text-text-secondary/40">
                Choose from your collection to view details
              </p>
            </div>
          )}
        </div>
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
