import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WearLogList } from "./wear-log-list";

const markdownSpy = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/markdown-content", () => ({
  MarkdownContent: (props: any) => {
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

vi.mock("@/components/edit-wear-log-dialog", () => ({
  EditWearLogDialog: () => null,
}));

describe("WearLogList markdown wiring", () => {
  test("passes wear-log comments through MarkdownContent", () => {
    render(
      <WearLogList
        logs={[
          {
            _id: "log_1",
            wornAt: Date.now(),
            sprays: 2,
            context: "office",
            rating: 8,
            comment: "**bold note**",
          } as any,
        ]}
      />,
    );

    expect(markdownSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "**bold note**",
        collapsible: true,
        className: "text-xs text-text-secondary",
      }),
    );
  });
});
