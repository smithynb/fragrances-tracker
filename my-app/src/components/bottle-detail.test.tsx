import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { BottleDetail } from "./bottle-detail";
import { useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type MarkdownContentMockProps = {
  content: string;
  collapsible?: boolean;
  className?: string;
};

const markdownSpy = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(),
}));

vi.mock("@/components/markdown-content", () => ({
  MarkdownContent: (props: MarkdownContentMockProps) => {
    markdownSpy(props);
    return (
      <div
        data-testid="markdown-content"
        data-collapsible={String(Boolean(props.collapsible))}
        data-classname={props.className ?? ""}
      >
        {props.content}
      </div>
    );
  },
}));

vi.mock("@/components/favorite-toggle", () => ({
  FavoriteToggle: () => null,
}));

vi.mock("@/components/wear-log-list", () => ({
  WearLogList: () => null,
}));

vi.mock("@/components/add-wear-log-dialog", () => ({
  AddWearLogDialog: () => null,
}));

vi.mock("@/components/coach-mark", () => ({
  CoachMark: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useQueryMock = vi.mocked(useQuery);

const bottleFixture = {
  _id: "bottle_1",
  _creationTime: 0,
  name: "Aventus",
  brand: "Creed",
  sizeMl: 50,
  tags: ["signature"],
  comments: "**top note** with [docs](https://example.com)",
  isFavorite: false,
} as Doc<"bottles">;

describe("BottleDetail markdown wiring", () => {
  test("passes fragrance comments through MarkdownContent", () => {
    useQueryMock.mockImplementation((...args: unknown[]) => {
      const [query] = args;
      const name = getFunctionName(query as never);
      if (name === "bottles:getBottle") return bottleFixture;
      if (name === "wearLogs:listWearLogsByBottle") return [];
      return undefined;
    });

    render(
      <BottleDetail
        bottleId={"bottle_1" as Id<"bottles">}
        onEdit={vi.fn()}
        onAddWearLog={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markdownSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "**top note** with [docs](https://example.com)",
        collapsible: true,
        className: "text-sm text-text-secondary",
      }),
    );
  });
});
