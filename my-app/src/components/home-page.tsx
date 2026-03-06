"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottleCollection } from "@/components/bottle-collection";
import { BottleDetail } from "@/components/bottle-detail";
import { AddBottleDialog } from "@/components/add-bottle-dialog";
import { AddWearLogDialog } from "@/components/add-wear-log-dialog";
import { Wine } from "lucide-react";

export function HomePage() {
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
    <div className="flex flex-col h-dvh bg-bg">
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
