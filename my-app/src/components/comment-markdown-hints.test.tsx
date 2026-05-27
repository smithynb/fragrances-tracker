import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AddBottleDialog } from "./add-bottle-dialog";
import { AddWearLogDialog } from "./add-wear-log-dialog";
import { EditWearLogDialog } from "./edit-wear-log-dialog";
import type { Doc, Id } from "../../convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const helperText = "Markdown supported: **bold**, *italic*, [link text](url), - lists";

const noop = () => {};

const wearLogFixture = {
  _id: "wearLog_1" as Id<"wearLogs">,
  _creationTime: 0,
  bottleId: "bottle_1" as Id<"bottles">,
  wornAt: Date.now(),
  sprays: 3,
  context: undefined,
  rating: undefined,
  comment: "",
  userId: "user_1" as Id<"users">,
} satisfies Doc<"wearLogs">;

describe("comment editor guidance", () => {
  test("shows markdown guidance in the fragrance editor", () => {
    render(<AddBottleDialog open onOpenChange={noop} />);
    expect(screen.getByText(helperText)).toBeInTheDocument();
  });

  test("shows markdown guidance in the new wear-log editor", () => {
    render(<AddWearLogDialog open onOpenChange={noop} bottleId={"bottle_1" as Id<"bottles">} />);
    expect(screen.getByText(helperText)).toBeInTheDocument();
  });

  test("shows markdown guidance in the wear-log edit dialog", () => {
    render(<EditWearLogDialog open onOpenChange={noop} log={wearLogFixture} />);
    expect(screen.getByText(helperText)).toBeInTheDocument();
  });
});
