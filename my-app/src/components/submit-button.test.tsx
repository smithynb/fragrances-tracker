import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SubmitButton } from "./submit-button";
import { FormErrorBanner } from "./form-error-banner";

describe("SubmitButton", () => {
  test("idle: shows label and Ctrl+Enter hint, enabled", () => {
    render(<SubmitButton submitting={false} label="Log Wear" busyLabel="Logging..." />);
    const button = screen.getByRole("button", { name: /Log Wear/ });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+Enter");
    expect(button).toHaveTextContent("Ctrl");
  });

  test("submitting: shows busy label, disabled, no hint", () => {
    render(<SubmitButton submitting label="Log Wear" busyLabel="Logging..." />);
    const button = screen.getByRole("button", { name: "Logging..." });
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent("Ctrl");
  });
});

describe("FormErrorBanner", () => {
  test("renders nothing without a message", () => {
    const { container } = render(<FormErrorBanner message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders the message as an alert", () => {
    render(<FormErrorBanner message="Something went wrong. Please try again." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
