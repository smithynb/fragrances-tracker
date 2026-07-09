// src/components/connected-apps.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { ConnectedApps } from "./connected-apps";

const mockUseQuery = vi.fn();
const mockRevoke = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => mockRevoke,
}));

const GRANT = {
  _id: "grant1",
  clientName: "Claude",
  scope: "read write",
  createdAt: Date.UTC(2026, 0, 5, 12),
  lastUsedAt: undefined,
};

describe("ConnectedApps", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockRevoke.mockReset().mockResolvedValue(null);
  });

  test("shows an empty state when there are no grants", () => {
    mockUseQuery.mockReturnValue([]);
    render(<ConnectedApps />);
    expect(screen.getByText(/no connected apps/i)).toBeInTheDocument();
  });

  test("lists grants and revokes on double-click confirm", async () => {
    mockUseQuery.mockReturnValue([GRANT]);
    const user = userEvent.setup();
    render(<ConnectedApps />);
    expect(screen.getByText("Claude")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /revoke claude/i });
    await user.click(button); // arm
    expect(mockRevoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirm revoke/i })); // confirm
    expect(mockRevoke).toHaveBeenCalledWith({ grantId: "grant1" });
  });
});
