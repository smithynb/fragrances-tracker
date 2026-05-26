import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MarkdownContent } from "./markdown-content";
import { mockOverflowLayout, restoreOverflowLayout } from "@/test/dom-mocks";

const richMarkdown = "**bold** *italic* [docs](https://example.com)\n\n- one\n- two\n`code`";

describe("MarkdownContent", () => {
  beforeEach(() => {
    mockOverflowLayout();
  });

  afterEach(() => {
    restoreOverflowLayout();
  });

  test("renders supported markdown syntax", () => {
    const { container } = render(<MarkdownContent content={richMarkdown} />);

    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container).toHaveTextContent("code");
  });

  test("renders ordered lists", () => {
    render(<MarkdownContent content={"1. first\n2. second\n"} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("first");
    expect(items[1]).toHaveTextContent("second");
  });

  test("renders plain text without markdown markings", () => {
    const { container } = render(<MarkdownContent content="Just some plain text." />);

    // No rich elements, but the text should appear.
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("Just some plain text.");
  });

  test("renders empty content without crashing", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("does not render disallowed HTML tags", () => {
    const { container } = render(<MarkdownContent content="safe <script>alert(1)</script> text" />);

    // No DOM script node is created — HTML is either escaped or stripped.
    expect(container.querySelector("script")).toBeNull();
    // The word "safe" still appears.
    expect(container).toHaveTextContent(/safe/);
  });

  test("shows a Show more toggle only when content overflows", async () => {
    render(<MarkdownContent content={richMarkdown} collapsible />);

    const toggle = await screen.findByRole("button", { name: "Show more" });
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Show less");
  });

  test("does not show a toggle for short content", async () => {
    mockOverflowLayout({ scrollHeight: 20, clientHeight: 40 });

    render(<MarkdownContent content="Short note" collapsible />);

    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
  });
});
