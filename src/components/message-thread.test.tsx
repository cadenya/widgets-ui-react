// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MessageThread } from "./message-thread.js";
import { applyEvent, type TimelineItem, type ToolItem } from "../timeline.js";
import type { WidgetEvent } from "@cadenya/widgets";

function msg(id: string, role: "user" | "assistant", content: string): TimelineItem {
  return { kind: "message", id, role, content, createdAt: "2026-08-14T00:00:00Z" };
}

function event(partial: Record<string, unknown>): WidgetEvent {
  return { conversationId: "c", createdAt: "2026-08-14T00:00:00Z", ...partial } as WidgetEvent;
}

const BUBBLE = ".cdny-bubble:not(.cdny-typing)";

describe("MessageThread empty messages", () => {
  it("renders no bubble for a tool-only assistant message", () => {
    // An assistant turn that only calls tools: empty content, then the tool.
    let timeline: TimelineItem[] = [msg("u1", "user", "Show me a demo resource card")];
    timeline = applyEvent(
      timeline,
      event({ id: "a1", type: "assistantMessage", assistantMessage: { content: "" } }),
    );
    timeline = applyEvent(
      timeline,
      event({
        id: "t1",
        type: "toolCalled",
        toolCalled: { toolCallId: "tc1", tool: { id: "tool_1", name: "DisplayResource" } },
      }),
    );
    const { container } = render(<MessageThread timeline={timeline} />);
    const bubbles = container.querySelectorAll(BUBBLE);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].classList.contains("cdny-bubble-user")).toBe(true);
  });

  it("renders no bubble for whitespace-only content", () => {
    const { container } = render(
      <MessageThread timeline={[msg("u1", "user", "hi"), msg("a1", "assistant", " \n\t ")]} />,
    );
    expect(container.querySelectorAll(".cdny-bubble-assistant:not(.cdny-typing)")).toHaveLength(0);
  });

  it("shows the bubble once a streaming message that started empty gains text", () => {
    const { container, rerender } = render(
      <MessageThread timeline={[msg("u1", "user", "hi"), msg("a1", "assistant", "")]} />,
    );
    expect(container.querySelectorAll(".cdny-bubble-assistant:not(.cdny-typing)")).toHaveLength(0);

    rerender(<MessageThread timeline={[msg("u1", "user", "hi"), msg("a1", "assistant", "Hello there")]} />);
    const bubbles = container.querySelectorAll(".cdny-bubble-assistant:not(.cdny-typing)");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toBe("Hello there");
  });

  it("still renders user messages verbatim", () => {
    const { container } = render(<MessageThread timeline={[msg("u1", "user", "  padded  ")]} />);
    expect(container.querySelector(".cdny-bubble-user")?.textContent).toBe("  padded  ");
  });
});

function tool(toolCallId: string, status: ToolItem["status"], args?: unknown): ToolItem {
  return {
    kind: "tool",
    id: `evt_${toolCallId}`,
    toolCallId,
    tool: { id: "tool_1", externalId: "display_resource", name: "DisplayResource" },
    status,
    args,
    createdAt: "2026-08-14T00:00:00Z",
  };
}

describe("MessageThread renderTool", () => {
  const timeline: TimelineItem[] = [
    msg("u1", "user", "Show my agents"),
    msg("a1", "assistant", ""),
    tool("tc1", "done", { name: "Faker" }),
    tool("tc2", "done", { name: "Cadenyaception" }),
    msg("a2", "assistant", "That's both."),
  ];

  it("skips tool items by default", () => {
    const { container } = render(<MessageThread timeline={timeline} />);
    expect(container.querySelectorAll(".cdny-thread-tool")).toHaveLength(0);
  });

  it("renders tool items inline, in timeline order, from their folded state", () => {
    const { container } = render(
      <MessageThread
        timeline={timeline}
        renderTool={(item) => <span data-testid="card">{(item.args as { name: string }).name}</span>}
      />,
    );
    const thread = container.querySelector(".cdny-thread")!;
    const order = [...thread.children]
      .map((el) => el.className.split(" ")[0])
      .filter((c) => c === "cdny-bubble" || c === "cdny-thread-tool");
    expect(order).toEqual(["cdny-bubble", "cdny-thread-tool", "cdny-thread-tool", "cdny-bubble"]);
    expect([...container.querySelectorAll('[data-testid="card"]')].map((el) => el.textContent)).toEqual([
      "Faker",
      "Cadenyaception",
    ]);
    expect(container.querySelector(".cdny-thread-tool-done")).not.toBeNull();
  });

  it("omits items the callback declines", () => {
    const { container } = render(
      <MessageThread
        timeline={timeline}
        renderTool={(item) => (item.toolCallId === "tc2" ? <span>kept</span> : null)}
      />,
    );
    expect(container.querySelectorAll(".cdny-thread-tool")).toHaveLength(1);
  });
});
