import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MarkdownContent } from "./markdown-content";

describe("MarkdownContent smoke test", () => {
  test("renders supported markdown syntax", () => {
    render(
      <MarkdownContent
        content={"**bold** *italic* [docs](https://example.com)\n\n- one\n- two\n`code`"}
      />,
    );

    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });
});
