// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MessageThread } from "./message-thread.js";
import { applyEvent, type TimelineItem } from "../timeline.js";
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
