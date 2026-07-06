import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { FormField } from "./form-field";

describe("FormField", () => {
  test("wires label, input, and passthrough props", async () => {
    const onChange = vi.fn();
    render(
      <FormField id="sprays" label="Sprays *" type="number" value="3" onChange={onChange} min="1" />,
    );
    const input = screen.getByLabelText("Sprays *");
    expect(input).toHaveValue(3);
    expect(input).toHaveAttribute("aria-invalid", "false");
    await userEvent.type(input, "1");
    expect(onChange).toHaveBeenCalled();
  });

  test("shows the error state", () => {
    render(
      <FormField id="sprays" label="Sprays *" error="Must be between 1 and 100" value="" onChange={() => {}} />,
    );
    const input = screen.getByLabelText("Sprays *");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "sprays-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Must be between 1 and 100");
  });
});
