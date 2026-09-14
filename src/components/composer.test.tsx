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
  it("grows and shrinks with a multiline draft", () => {
    let scrollHeight = 36;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => scrollHeight);
    render(<Composer onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

    expect(input.style.height).toBe("36px");
    scrollHeight = 116;
    fireEvent.change(input, { target: { value: "One\nTwo\nThree\nFour\nFive" } });
    expect(input.style.height).toBe("116px");

    scrollHeight = 36;
    fireEvent.change(input, { target: { value: "One" } });
    expect(input.style.height).toBe("36px");
  });

  it.each(["bar", "pill", "floating"] as const)("autosizes the %s variant", (variant) => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(72);
    render(<Composer onSend={vi.fn()} variant={variant} />);
    const input = typeMessage("One\nTwo\nThree");
    expect(input.style.height).toBe("72px");
  });

  it("shrinks after a successful send", async () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function (
      this: HTMLTextAreaElement,
    ) {
      return this.value ? 72 : 36;
    });
    render(<Composer onSend={vi.fn()} />);
    const input = typeMessage("One\nTwo\nThree");
    expect(input.style.height).toBe("72px");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(input.style.height).toBe("36px"));
    expect(input.value).toBe("");
  });

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
