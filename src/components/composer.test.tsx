// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "./composer.js";

function typeMessage(message = "Hello") {
  const input = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: message } });
  return input;
}

describe("Composer", () => {
  it("retains a failed draft, shows the error, and allows retry", async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    render(<Composer onSend={onSend} />);
    const input = typeMessage("  Hello  ");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Offline");
    expect(input.value).toBe("  Hello  ");
    expect(input.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(input.value).toBe(""));
    expect(onSend.mock.calls).toEqual([["Hello"], ["Hello"]]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("locks synchronous duplicate submissions while the first message is being created", async () => {
    let resolve!: () => void;
    const onSend = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<Composer onSend={onSend} />);
    const input = typeMessage();
    act(() => {
      fireEvent.submit(input.closest("form")!);
      fireEvent.submit(input.closest("form")!);
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    await act(async () => resolve());
    expect(input.value).toBe("");
    expect(input.disabled).toBe(false);
  });

  it("does not send on IME confirmation, Shift+Enter, or while disabled", () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer onSend={onSend} />);
    const input = typeMessage();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    rerender(<Composer onSend={onSend} disabled />);
    fireEvent.submit(input.closest("form")!);
    expect(onSend).not.toHaveBeenCalled();
  });
});
