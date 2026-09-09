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
} from "./timeline.js";

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

describe("out-of-order and duplicate tool events", () => {
  const tool = { id: "tool_1", name: "DisplayResource", externalId: "display_resource" };
  const args = { name: "Faker", resource_type: "agent" };

  it("keeps a finished call done when toolCalled arrives after toolResult", () => {
    // alwaysSetResult bare tools acknowledge before the call event lands.
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({ id: "e1", type: "toolResult", toolResult: { toolCallId: "tc1", tool, content: "ok" } }),
    );
    expect((items[0] as ToolItem).status).toBe("done");
    items = applyEvent(
      items,
      event({ id: "e2", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool, arguments: args } }),
    );
    expect(items).toHaveLength(1);
    const item = items[0] as ToolItem;
    expect(item.status).toBe("done");
    // The late start event still enriches the item.
    expect(item.args).toEqual(args);
    expect(item.content).toBe("ok");
    expect(item.tool).toEqual(tool);
  });

  it("keeps a failed call failed when toolCalled arrives after toolError", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(items, event({ id: "e1", type: "toolError", toolError: { toolCallId: "tc1", tool } }));
    items = applyEvent(
      items,
      event({ id: "e2", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool, arguments: args } }),
    );
    expect((items[0] as ToolItem).status).toBe("failed");
    expect((items[0] as ToolItem).args).toEqual(args);
  });

  it("does not regress approved or running calls on replayed earlier events", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({ id: "e1", type: "toolApprovalRequested", toolApprovalRequested: { toolCallId: "tc1", tool } }),
    );
    items = applyEvent(items, event({ id: "e2", type: "toolApproved", toolApproved: { toolCallId: "tc1" } }));
    items = applyEvent(
      items,
      event({ id: "e1", type: "toolApprovalRequested", toolApprovalRequested: { toolCallId: "tc1", tool } }),
    );
    expect((items[0] as ToolItem).status).toBe("approved");
    items = applyEvent(items, event({ id: "e3", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool } }));
    items = applyEvent(items, event({ id: "e2", type: "toolApproved", toolApproved: { toolCallId: "tc1" } }));
    expect((items[0] as ToolItem).status).toBe("running");
  });

  it("is idempotent under duplicate events and keeps content across them", () => {
    const steps: WidgetEvent[] = [
      event({ id: "e1", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool, arguments: args } }),
      event({ id: "e2", type: "toolResult", toolResult: { toolCallId: "tc1", tool, content: { ok: true } } }),
    ];
    const once = applyEvents([], steps);
    const twice = applyEvents(once, steps);
    expect(twice).toEqual(once);
    expect((twice[0] as ToolItem).status).toBe("done");
    expect((twice[0] as ToolItem).args).toEqual(args);
    expect((twice[0] as ToolItem).content).toEqual({ ok: true });
  });

  it("lets a later terminal event replace an earlier one", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(items, event({ id: "e1", type: "toolResult", toolResult: { toolCallId: "tc1", tool } }));
    items = applyEvent(items, event({ id: "e2", type: "toolError", toolError: { toolCallId: "tc1", tool } }));
    expect((items[0] as ToolItem).status).toBe("failed");
  });

  it("still walks the normal call-before-result order", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({ id: "e1", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool, arguments: args } }),
    );
    expect((items[0] as ToolItem).status).toBe("running");
    items = applyEvent(
      items,
      event({ id: "e2", type: "toolResult", toolResult: { toolCallId: "tc1", tool, content: "ok" } }),
    );
    expect((items[0] as ToolItem).status).toBe("done");
    expect((items[0] as ToolItem).args).toEqual(args);
    expect((items[0] as ToolItem).content).toBe("ok");
  });
});

describe("tool call arguments", () => {
  const tool = { id: "tool_1", name: "SetModel" };

  it("captures shared arguments from toolCalled and keeps them through the result", () => {
    let items: TimelineItem[] = [];
    items = applyEvent(
      items,
      event({
        id: "e1",
        type: "toolCalled",
        toolCalled: { toolCallId: "tc1", tool, arguments: { model: "claude-opus-5" } },
      }),
    );
    expect((items[0] as ToolItem).args).toEqual({ model: "claude-opus-5" });
    items = applyEvent(
      items,
      event({ id: "e2", type: "toolResult", toolResult: { toolCallId: "tc1", tool } }),
    );
    expect((items[0] as ToolItem).status).toBe("done");
    expect((items[0] as ToolItem).args).toEqual({ model: "claude-opus-5" });
  });

  it("leaves args undefined for tools not sharing them", () => {
    const items = applyEvent(
      [],
      event({ id: "e1", type: "toolCalled", toolCalled: { toolCallId: "tc1", tool } }),
    );
    expect((items[0] as ToolItem).args).toBeUndefined();
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
