import { describe, expect, it } from "vitest";
import type { WidgetEvent } from "@cadenya/widgets";
import fixtureJson from "./__fixtures__/faker-conversation.json";
import {
  activeTools,
  applyEvent,
  applyEvents,
  awaitingReply,
  type MessageItem,
  type TimelineItem,
  type ToolItem,
} from "./timeline";

// A real conversation captured from the widget host: two visitor turns, five
// assistant segments interleaved with twelve tool calls (3 GenerateFake, 3
// GetFakerOptions, 6 GenerateFake), all completed.
const FIXTURE = fixtureJson as unknown as WidgetEvent[];

function event(partial: Record<string, unknown>): WidgetEvent {
  return { conversationId: "c", createdAt: "2026-08-14T00:00:00Z", ...partial } as WidgetEvent;
}

describe("applyEvents over a real conversation log", () => {
  const items = applyEvents([], FIXTURE);

  it("folds 31 events into 19 items: 2 user, 5 assistant, 12 tools", () => {
    expect(items).toHaveLength(19);
    const messages = items.filter((i): i is MessageItem => i.kind === "message");
    expect(messages.filter((m) => m.role === "user")).toHaveLength(2);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(5);
    expect(items.filter((i) => i.kind === "tool")).toHaveLength(12);
  });

  it("keeps assistant segments distinct and in event order", () => {
    const contents = items
      .filter((i): i is MessageItem => i.kind === "message" && i.role === "assistant")
      .map((m) => m.content.slice(0, 12));
    expect(contents).toEqual([
      "Hi there! 👋", // the emoji is two UTF-16 units, so slice(0, 12) ends here
      "I'll generat",
      "Looks like t",
      "Got the corr",
      "Here's your ",
    ]);
  });

  it("folds each tool call to one item ending done", () => {
    const tools = items.filter((i): i is ToolItem => i.kind === "tool");
    expect(new Set(tools.map((t) => t.toolCallId)).size).toBe(12);
    expect(tools.every((t) => t.status === "done")).toBe(true);
  });

  it("is idempotent under replay of the same events", () => {
    expect(applyEvents(items, FIXTURE)).toEqual(items);
  });

  it("has no active tools and owes no reply once the final message lands", () => {
    expect(activeTools(items)).toHaveLength(0);
    expect(awaitingReply(items)).toBe(false);
  });

  it("reports the in-flight run mid-conversation", () => {
    // Fold up to (not including) the final assistant message: the trailing
    // six GenerateFake results are then the active run.
    const mid = applyEvents([], FIXTURE.slice(0, -1));
    const active = activeTools(mid);
    expect(active).toHaveLength(6);
    expect(active.every((t) => t.status === "done")).toBe(true);
    // Tools churning between segments still count as "agent working".
    expect(awaitingReply(mid)).toBe(true);
  });
});

describe("assistant streaming snapshots", () => {
  it("replaces content when the same event id is re-emitted", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({ id: "e1", type: "assistantMessage", assistantMessage: { content: "Hel" } }),
    );
    items = applyEvent(
      items,
      event({ id: "e1", type: "assistantMessage", assistantMessage: { content: "Hello there" } }),
    );
    expect(items).toHaveLength(1);
    expect((items[0] as MessageItem).content).toBe("Hello there");
  });

  it("appends when a new segment arrives under a new id", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({ id: "e1", type: "assistantMessage", assistantMessage: { content: "First" } }),
    );
    items = applyEvent(
      items,
      event({ id: "e2", type: "assistantMessage", assistantMessage: { content: "Second" } }),
    );
    expect(items.map((i) => (i as MessageItem).content)).toEqual(["First", "Second"]);
  });
});

describe("tool call lifecycle folding", () => {
  const tool = { id: "tool_1", name: "LookupOrder" };

  it("walks approvalRequested → approved → running → done on one item", () => {
    let items: TimelineItem[] = [];
    const statuses: string[] = [];
    const steps: WidgetEvent[] = [
      event({ id: "e1", type: "toolApprovalRequested", toolApprovalRequested: { toolCallId: "tc1", tool } }),
      event({ id: "e2", type: "toolApproved", toolApproved: { toolCallId: "tc1" } }),
      event({ id: "e3", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool } }),
      event({ id: "e4", type: "toolResult", toolResult: { toolCallId: "tc1", tool, content: { orderId: 7 } } }),
    ];
    for (const step of steps) {
      items = applyEvent(items, step);
      expect(items).toHaveLength(1);
      statuses.push((items[0] as ToolItem).status);
    }
    expect(statuses).toEqual(["approvalRequested", "approved", "running", "done"]);
    expect((items[0] as ToolItem).content).toEqual({ orderId: 7 });
    expect((items[0] as ToolItem).tool).toEqual(tool);
  });

  it("does not owe a reply while a tool waits on approval or after denial", () => {
    let items: TimelineItem[] = [
      { kind: "message", id: "m1", role: "user", content: "hi", createdAt: "t" },
    ];
    items = applyEvent(
      items,
      event({ id: "e1", type: "toolApprovalRequested", toolApprovalRequested: { toolCallId: "tc1", tool } }),
    );
    expect(awaitingReply(items)).toBe(false);
    items = applyEvent(items, event({ id: "e2", type: "toolDenied", toolDenied: { toolCallId: "tc1" } }));
    expect(awaitingReply(items)).toBe(false);
  });
});

describe("notices", () => {
  it("renders error events as notices and stops the typing indicator", () => {
    let items: TimelineItem[] = [
      { kind: "message", id: "m1", role: "user", content: "hi", createdAt: "t" },
    ];
    expect(awaitingReply(items)).toBe(true);
    items = applyEvent(items, event({ id: "e1", type: "error", error: { message: "boom" } }));
    expect(items.at(-1)).toMatchObject({ kind: "notice", notice: "error", message: "boom" });
    expect(awaitingReply(items)).toBe(false);
  });

  it("ignores unknown event types for forward compatibility", () => {
    const items = applyEvent([], event({ id: "e1", type: "somethingNew", somethingNew: {} }));
    expect(items).toHaveLength(0);
  });
});
