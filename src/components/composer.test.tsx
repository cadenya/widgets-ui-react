// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "./composer.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function typeMessage(message = "Hello") {
  const input = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: message } });
  return input;
}

describe("Composer", () => {
  it("remeasures wrapped text when width changes and ignores height-only notifications", () => {
    let callback!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(next: ResizeObserverCallback) { callback = next; }
      observe() {}
      disconnect = disconnect;
    });
    let scrollHeight = 36;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => scrollHeight);
    const { unmount } = render(<Composer onSend={vi.fn()} />);
    const input = typeMessage("An unchanged draft wraps as its container gets narrower");
    const notifyWidth = (width: number) => act(() => callback(
      [{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver,
    ));
    notifyWidth(500);
    scrollHeight = 96;
    notifyWidth(200);
    expect(input.style.height).toBe("96px");
    scrollHeight = 120;
    notifyWidth(200);
    expect(input.style.height).toBe("96px");
    scrollHeight = 36;
    notifyWidth(500);
    expect(input.style.height).toBe("36px");
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("includes borders in the border-box height", () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(72);
    vi.spyOn(HTMLTextAreaElement.prototype, "offsetHeight", "get").mockReturnValue(74);
    vi.spyOn(HTMLTextAreaElement.prototype, "clientHeight", "get").mockReturnValue(72);
    render(<Composer onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    input.style.borderTopWidth = "1px";
    input.style.borderBottomWidth = "1px";
    typeMessage("One\nTwo\nThree");
    expect(input.style.height).toBe("74px");
  });

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
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    await act(async () => resolve());
    expect(input.value).toBe("");
    expect(input.disabled).toBe(false);
  });

  it.each(["Enter", "Send"])("keeps focus during and after submission via %s", async (method) => {
    let resolve!: () => void;
    const onSend = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<Composer onSend={onSend} />);
    const input = typeMessage();
    input.focus();
    if (method === "Enter") {
      fireEvent.keyDown(input, { key: "Enter" });
    } else {
      const button = screen.getByRole("button", { name: "Send" });
      // fireEvent.click does not simulate the browser moving focus to the button.
      button.focus();
      fireEvent.click(button);
    }

    expect(document.activeElement).toBe(input);
    // jsdom does not blur controls when disabled; check browser focusability too.
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Hello");

    await act(async () => resolve());
    expect(input.value).toBe("");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it("keeps focus and the draft after a failed submission", async () => {
    let reject!: (error: Error) => void;
    const onSend = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<Composer onSend={onSend} />);
    const input = typeMessage("  Hello  ");
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);

    await act(async () => reject(new Error("Offline")));
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    expect(input.value).toBe("  Hello  ");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it("preserves focus across parent loading states after sending", async () => {
    let resolve!: () => void;
    const onSend = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const { rerender } = render(<Composer onSend={onSend} />);
    const input = typeMessage();
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    rerender(<Composer onSend={onSend} disabled />);
    await act(async () => resolve());
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(document.activeElement).toBe(input);

    rerender(<Composer onSend={onSend} />);
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it.each(["success", "failure"])("does not reclaim focus on %s if the user moved elsewhere", async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const onSend = vi.fn(() => new Promise<void>((done, fail) => { resolve = done; reject = fail; }));
    render(<><Composer onSend={onSend} /><button>Elsewhere</button></>);
    const input = typeMessage();
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    await act(async () => outcome === "success" ? resolve() : reject(new Error("Offline")));
    expect(document.activeElement).toBe(elsewhere);
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
