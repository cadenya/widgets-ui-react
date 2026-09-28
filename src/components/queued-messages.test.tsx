// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { WidgetQueuedMessage } from "@cadenya/widgets";
import { QueuedMessages } from "./queued-messages.js";

function queued(id: string, content: string): WidgetQueuedMessage {
  return { id, conversationId: "c", content, state: "STATE_QUEUED", createdAt: "2026-08-14T00:00:00Z" };
}

describe("QueuedMessages", () => {
  it("renders nothing without queued messages", () => {
    const { container } = render(<QueuedMessages messages={[]} onRemove={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("lists each message on one line with its full text as a tooltip", () => {
    const long = "A long follow-up that will not fit on one line of the tray, so it gets an ellipsis";
    render(<QueuedMessages messages={[queued("q1", "short"), queued("q2", long)]} onRemove={vi.fn()} variant="floating" />);
    const list = screen.getByRole("list", { name: "Queued messages" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[1]).getByText(long).getAttribute("title")).toBe(long);
    expect(list.parentElement?.className).toBe("cdny-queued cdny-queued-floating");
  });

  it("removes a message by id", () => {
    const onRemove = vi.fn();
    render(<QueuedMessages messages={[queued("q1", "first"), queued("q2", "second")]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove queued: second" }));
    expect(onRemove).toHaveBeenCalledWith("q2");
  });

  it("reports a removal that failed", async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error("the agent already picked it up"));
    render(<QueuedMessages messages={[queued("q1", "first")]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove queued: first" }));
    expect((await screen.findByRole("alert")).textContent).toContain("the agent already picked it up");
  });
});
