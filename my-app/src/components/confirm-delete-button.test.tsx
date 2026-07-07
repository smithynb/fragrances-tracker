import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ConfirmDeleteButton } from "./confirm-delete-button";

describe("ConfirmDeleteButton", () => {
  test("idle: shows the idle label and hides the confirm text", () => {
    render(
      <ConfirmDeleteButton
        confirming={false}
        onClick={vi.fn()}
        onMouseLeave={vi.fn()}
        idleLabel="Delete wear log"
        confirmLabel="Confirm delete wear log"
      />,
    );
    expect(screen.getByRole("button", { name: "Delete wear log" })).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toHaveAttribute("aria-hidden", "true");
  });

  test("confirming: shows the confirm label and fires onClick", async () => {
    const onClick = vi.fn();
    render(
      <ConfirmDeleteButton
        confirming
        onClick={onClick}
        onMouseLeave={vi.fn()}
        idleLabel="Delete wear log"
        confirmLabel="Confirm delete wear log"
      />,
    );
    const button = screen.getByRole("button", { name: "Confirm delete wear log" });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
