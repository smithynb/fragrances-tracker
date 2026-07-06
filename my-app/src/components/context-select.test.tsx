import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ContextSelect } from "./context-select";

describe("ContextSelect", () => {
  test("shows 'No context' when value is empty", () => {
    render(<ContextSelect value="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("No context");
  });

  test("shows the selected context", () => {
    render(<ContextSelect value="Office" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Office");
  });
});
