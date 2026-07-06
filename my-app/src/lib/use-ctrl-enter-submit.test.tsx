import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, test, vi } from "vitest";
import { useCtrlEnterSubmit } from "./use-ctrl-enter-submit";

function TestForm({ submitting = false, onSubmit }: { submitting?: boolean; onSubmit: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const handleKeyDown = useCtrlEnterSubmit(formRef, submitting);
  return (
    <form
      ref={formRef}
      onKeyDown={handleKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input aria-label="field" />
      <textarea aria-label="notes" />
    </form>
  );
}

describe("useCtrlEnterSubmit", () => {
  test("Ctrl+Enter submits the form", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("field"), "{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+Enter is ignored while submitting", async () => {
    const onSubmit = vi.fn();
    render(<TestForm submitting onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("field"), "{Control>}{Enter}{/Control}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("plain Enter on an input does not submit", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("field"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("plain Enter in a textarea inserts a newline and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>("notes");
    await userEvent.type(textarea, "a{Enter}b");
    expect(textarea.value).toBe("a\nb");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
