// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import { WidgetClientProvider } from "../context.js";
import { approvalAgent, createMockClient, TOOLS } from "../__stories__/mock-client.js";
import type { ToolRenderProps } from "../tool-registry.js";
import { ConversationsPanel } from "./conversations-panel.js";
import { PageToolsProvider, usePageTool } from "../page-tools.js";

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

/** A finished conversation: an assistant turn that presented two cards, then replied. */
function historyWithCards(conversationId: string): WidgetEvent[] {
  const at = "2026-08-14T00:00:00Z";
  const base = (id: string) => ({ id, conversationId, createdAt: at });
  return [
    { ...base("e1"), type: "userMessage", userMessage: { content: "Show my agents" } },
    { ...base("e2"), type: "assistantMessage", assistantMessage: { content: "" } },
    { ...base("e3"), type: "toolCalled", toolCalled: { toolCallId: "tc1", tool: TOOL, arguments: { name: "Faker" } } },
    { ...base("e4"), type: "toolResult", toolResult: { toolCallId: "tc1", tool: TOOL, content: { presented: true } } },
    { ...base("e5"), type: "toolCalled", toolCalled: { toolCallId: "tc2", tool: { id: "tool_02", name: "ListAgents" } } },
    { ...base("e6"), type: "toolResult", toolResult: { toolCallId: "tc2", tool: { id: "tool_02", name: "ListAgents" } } },
    { ...base("e7"), type: "assistantMessage", assistantMessage: { content: "That's all of them." } },
  ] as WidgetEvent[];
}

function PageHandler({ onCall }: { onCall: () => void }) {
  usePageTool("display_resource", () => {
    onCall();
    return { ok: true };
  });
  return null;
}

describe("ConversationsPanel toolPlacement=\"inline\"", () => {
  it("keeps finished tool cards in the thread after the reply and on reopen, without re-running them", async () => {
    const renderer = vi.fn(({ args, status, result }: ToolRenderProps) => (
      <div data-testid="card">
        {(args as { name: string }).name} · {status} · {JSON.stringify(result)}
      </div>
    ));
    const pageHandler = vi.fn();
    const { client } = createMockClient({
      latency: 0,
      conversations: [conversation("c1")],
      events: { c1: historyWithCards("c1") },
    });
    const setToolCallContent = vi.spyOn(client.conversations, "setToolCallContent");
    const { container } = render(
      <WidgetClientProvider client={client}>
        <PageToolsProvider>
          <PageHandler onCall={pageHandler} />
          <ConversationsPanel toolPlacement="inline" toolComponents={{ display_resource: renderer }} />
        </PageToolsProvider>
      </WidgetClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));

    const card = await screen.findByTestId("card");
    expect(card.textContent).toBe('Faker · done · {"presented":true}');
    // The reply that followed the cards is there too — the card did not retire.
    await screen.findByText("That's all of them.");
    expect(screen.getByTestId("card")).toBe(card);
    // Unregistered tools fall back to the default chip, also inline.
    expect(container.querySelector(".cdny-thread-tool .cdny-tool")?.textContent).toContain("ListAgents");
    // No activity bar in inline mode.
    expect(container.querySelector(".cdny-activity")).toBeNull();
    // History backfill never re-executes a finished bare call or resubmits its result.
    await waitFor(() => expect(renderer).toHaveBeenCalled());
    expect(pageHandler).not.toHaveBeenCalled();
    expect(setToolCallContent).not.toHaveBeenCalled();
  });

  it("still lets a running bare tool's component submit its result", async () => {
    const renderer = vi.fn(({ status, submit }: ToolRenderProps) => (
      <button data-testid="submit" disabled={status !== "running"} onClick={() => submit("picked")}>
        {status}
      </button>
    ));
    const { client } = createMockClient({
      latency: 0,
      conversations: [conversation("c1")],
      events: { c1: events("c1", { arguments: ARGS }) },
    });
    render(
      <WidgetClientProvider client={client}>
        <ConversationsPanel toolPlacement="inline" toolComponents={{ display_resource: renderer }} />
      </WidgetClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));
    const button = await screen.findByTestId("submit");
    expect(button.textContent).toBe("running");
    fireEvent.click(button);
    // The mock turns setToolCallContent into a toolResult event; it folds to done in place.
    await waitFor(() => expect(screen.getByTestId("submit").textContent).toBe("done"));
  });
});

describe("ConversationsPanel denied tool calls", () => {
  const APPROVAL_TOOL = { id: "tool_01APPROVAL", name: "Run approval demo" };

  it("labels a denied call as denied after history reload, despite the trailing toolResult", async () => {
    const at = "2026-08-14T00:00:00Z";
    const base = (id: string) => ({ id, conversationId: "c1", createdAt: at });
    const { client } = createMockClient({
      latency: 0,
      conversations: [conversation("c1")],
      events: {
        c1: [
          { ...base("e1"), type: "userMessage", userMessage: { content: "Run the demo" } },
          { ...base("e2"), type: "toolApprovalRequested", toolApprovalRequested: { toolCallId: "tc1", tool: APPROVAL_TOOL } },
          { ...base("e3"), type: "toolDenied", toolDenied: { toolCallId: "tc1" } },
          { ...base("e4"), type: "toolResult", toolResult: { toolCallId: "tc1", tool: APPROVAL_TOOL } },
        ] as WidgetEvent[],
      },
    });
    const { container } = render(
      <WidgetClientProvider client={client}>
        <ConversationsPanel />
      </WidgetClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));
    await waitFor(() => expect(container.querySelector(".cdny-tool")).not.toBeNull());
    expect(container.querySelector(".cdny-tool")?.textContent).toContain("denied");
    expect(container.querySelector(".cdny-tool-denied")).not.toBeNull();
  });

  it("keeps the denied label when the denial result arrives over the live stream", async () => {
    const { client } = createMockClient({ latency: 0, thinkTime: 0, agent: approvalAgent });
    // Inline placement keeps the chip on screen after the agent's reply.
    const { container } = render(
      <WidgetClientProvider client={client}>
        <ConversationsPanel toolPlacement="inline" />
      </WidgetClientProvider>,
    );
    fireEvent.change(await screen.findByPlaceholderText(/get started/i), { target: { value: "Cancel my order" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deny" }, { timeout: 5000 }));
    await waitFor(() => expect(container.querySelector(".cdny-tool-denied")).not.toBeNull());
    // The agent's denial result and closing reply both stream in after the deny.
    await screen.findByText(/left the order as it is/, {}, { timeout: 5000 });
    const chip = container.querySelector(".cdny-tool");
    expect(chip?.classList.contains("cdny-tool-denied")).toBe(true);
    expect(chip?.textContent).toContain(`${TOOLS.cancelOrder.name} denied`);
    expect(container.querySelector(".cdny-tool-done")).toBeNull();
  });
});


describe("ConversationsPanel paginated history", () => {
  it("does not execute a historical call whose result arrives on the next page", async () => {
    const { client } = createMockClient({ latency: 0, conversations: [conversation("c1")] });
    const history = historyWithCards("c1");
    let resolve!: (page: { items: WidgetEvent[] }) => void;
    vi.spyOn(client.conversations, "listEvents")
      .mockResolvedValueOnce({ items: history.slice(0, 3), nextCursor: "page2" } as Awaited<ReturnType<typeof client.conversations.listEvents>>)
      .mockImplementationOnce(() => new Promise<{ items: WidgetEvent[] }>((done) => { resolve = done; }) as ReturnType<typeof client.conversations.listEvents>);
    const handler = vi.fn();
    render(
      <WidgetClientProvider client={client}>
        <PageToolsProvider>
          <PageHandler onCall={handler} />
          <ConversationsPanel />
        </PageToolsProvider>
      </WidgetClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));
    await waitFor(() => expect(client.conversations.listEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Loading conversation…")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    await act(async () => resolve({ items: history.slice(3) }));
    await screen.findByText("That's all of them.");
    expect(handler).not.toHaveBeenCalled();
  });
});
