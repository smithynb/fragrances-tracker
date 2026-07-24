// src/components/pat-manager.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { getFunctionName } from "convex/server";
import { PatManager } from "./pat-manager";
import { PAT_PREFIX, sha256Hex } from "@/lib/mcp/token-crypto";

const mockUseQuery = vi.fn();
const mockCreate = vi.fn();
const mockRevoke = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (ref: never) => (getFunctionName(ref) === "apiTokens:revoke" ? mockRevoke : mockCreate),
}));

describe("PatManager", () => {
  beforeEach(() => {
    mockUseQuery.mockReset().mockReturnValue([]);
    mockCreate.mockReset().mockResolvedValue("tok1");
    mockRevoke.mockReset().mockResolvedValue(null);
  });

  test("creating a token sends only the hash and shows the raw value once", async () => {
    const user = userEvent.setup();
    render(<PatManager />);

    await user.click(screen.getByRole("button", { name: /create token/i }));
    await user.type(screen.getByLabelText(/token name/i), "Claude Code");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    // Raw token displayed once, fgt_-prefixed.
    const rawEl = await screen.findByTestId("raw-token");
    const raw = rawEl.textContent!;
    expect(raw.startsWith(PAT_PREFIX)).toBe(true);

    // The mutation received the SHA-256 of exactly that raw value — never the raw.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0] as { tokenHash: string; name: string };
    expect(args.name).toBe("Claude Code");
    expect(args.tokenHash).toBe(await sha256Hex(raw));
  });
});
