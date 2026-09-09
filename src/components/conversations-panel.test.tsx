// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import { WidgetClientProvider } from "../context.js";
import { createMockClient } from "../__stories__/mock-client.js";
import type { ToolRenderProps } from "../tool-registry.js";
import { ConversationsPanel } from "./conversations-panel.js";

const TOOL = { id: "tool_01DISPLAY", externalId: "display_resource", name: "DisplayResource" };
const ARGS = { name: "Faker", resource_type: "agent", labels: { env: "demo" } };

function conversation(id: string): WidgetConversation {
  const at = "2026-08-14T00:00:00Z";
  return { id, state: "STATE_OPEN", title: `Conversation ${id}`, createdAt: at, lastActiveAt: at };
}

function events(conversationId: string, toolCalled: Record<string, unknown>): WidgetEvent[] {
  const at = "2026-08-14T00:00:00Z";
  return [
    { id: "e1", conversationId, createdAt: at, type: "userMessage", userMessage: { content: "Show a card" } },
    { id: "e2", conversationId, createdAt: at, type: "assistantMessage", assistantMessage: { content: "" } },
    // Trailing tool call with no reply after it: still active, so the
    // registered renderer is mounted in the activity area.
    { id: "e3", conversationId, createdAt: at, type: "toolCalled", toolCalled: { toolCallId: "tc1", tool: TOOL, ...toolCalled } },
  ] as WidgetEvent[];
}

async function renderPanelWith(toolCalled: Record<string, unknown>) {
  const renderer = vi.fn((_props: ToolRenderProps) => <div data-testid="card">card</div>);
  const { client } = createMockClient({
    latency: 0,
    conversations: [conversation("c1")],
    events: { c1: events("c1", toolCalled) },
  });
  render(
    <WidgetClientProvider client={client}>
      <ConversationsPanel toolComponents={{ display_resource: renderer }} />
    </WidgetClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));
  await screen.findByTestId("card");
  return renderer;
}

describe("ConversationsPanel custom tool renderers", () => {
  it("forwards exposed arguments as `args`", async () => {
    const renderer = await renderPanelWith({ arguments: ARGS });
    const props = renderer.mock.calls.at(-1)![0];
    expect(props.args).toEqual(ARGS);
    expect(props.toolCall).toEqual({ toolCallId: "tc1", tool: TOOL });
    expect(props.status).toBe("running");
  });

  it("leaves `args` undefined when the runtime did not expose them", async () => {
    const renderer = await renderPanelWith({});
    const props = renderer.mock.calls.at(-1)![0];
    expect(props.args).toBeUndefined();
    expect("args" in props).toBe(true);
    expect(props.status).toBe("running");
  });
});
