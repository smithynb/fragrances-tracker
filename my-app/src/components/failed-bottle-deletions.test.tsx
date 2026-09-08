import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { FailedBottleDeletions } from "./failed-bottle-deletions";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useMutationMock = vi.mocked(useMutation);
const useQueryMock = vi.mocked(useQuery);

describe("FailedBottleDeletions", () => {
  test("shows the owner recovery action and requests the existing delete retry", async () => {
    const retryDeletion = vi.fn().mockResolvedValue(null);
    const bottleId = "bottle_1" as Id<"bottles">;
    useMutationMock.mockReturnValue(retryDeletion as never);
    useQueryMock.mockReturnValue([
      {
        _id: bottleId,
        name: "Recoverable bottle",
        cleanupStatus: "failed",
      },
    ] as never);

    render(<FailedBottleDeletions />);

    expect(screen.getByRole("heading", { name: "Deletion needs attention" })).toBeInTheDocument();
    expect(screen.getByText("Recoverable bottle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry deletion for Recoverable bottle" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Retry deletion for Recoverable bottle" }),
    );
    expect(retryDeletion).toHaveBeenCalledWith({ bottleId });
  });
});
