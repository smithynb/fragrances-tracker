import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BottleCard } from "./bottle-card";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const bottle = {
  _id: "bottle_1" as Id<"bottles">,
  _creationTime: 0,
  userId: "user_1" as Id<"users">,
  name: "Yeah! Man Passion",
  brand: "Maison Alhambra",
  sizeMl: 100,
  createdAt: 0,
} satisfies Doc<"bottles">;

describe("BottleCard", () => {
  test("uses wears as the card-level usage summary", () => {
    render(
      <BottleCard
        bottle={bottle}
        isSelected={false}
        onClick={vi.fn()}
        totalWears={10}
        index={0}
      />,
    );

    expect(screen.getByText("10 wears")).toBeInTheDocument();
    expect(screen.queryByText(/sprays/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/avg/i)).not.toBeInTheDocument();
  });
});
