// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import { WidgetClientProvider } from "../context.js";
import { createMockClient } from "../__stories__/mock-client.js";
import { ConversationsPanel } from "../components/conversations-panel.js";
import { PageToolsProvider, usePageToolsStore, type PageToolsStore } from "../page-tools.js";
import { AskUser } from "./ask-user.js";
import { DisplayDetails } from "./display-details.js";
import { WIDGET_TOOL_IDS } from "./ids.js";
import { WidgetTools, type WidgetToolsProps } from "./widget-tools.js";

const ref = (externalId: string) => ({ id: "tool_1", name: externalId, externalId });

function Capture({ onStore }: { onStore: (store: PageToolsStore | null) => void }) {
  onStore(usePageToolsStore());
  return null;
}

function renderWidgetTools(props: WidgetToolsProps) {
  let store: PageToolsStore | null = null;
  const tree = (p: WidgetToolsProps): ReactNode => (
    <PageToolsProvider>
      <WidgetTools {...p} />
      <Capture onStore={(s) => (store = s)} />
    </PageToolsProvider>
  );
  const view = render(tree(props));
  return {
    store: () => store!,
    rerender: (next: WidgetToolsProps) => view.rerender(tree(next)),
  };
}

const invoke = (store: PageToolsStore) =>
  store.resolve(ref(WIDGET_TOOL_IDS.getPageContext))!({
    toolCallId: "tc1",
    tool: ref(WIDGET_TOOL_IDS.getPageContext),
  });

describe("WidgetTools", () => {
  it("registers the template's renderers", () => {
    const { store } = renderWidgetTools({});
    expect(store().resolveComponent(ref(WIDGET_TOOL_IDS.askUser))).toBe(AskUser);
    expect(store().resolveComponent(ref(WIDGET_TOOL_IDS.displayDetails))).toBe(DisplayDetails);
  });

  it("answers get_page_context with the latest pageContext", async () => {
    const { store, rerender } = renderWidgetTools({ pageContext: { invoiceId: "inv_1" } });
    rerender({ pageContext: { invoiceId: "inv_2" } });
    expect(await invoke(store())).toEqual({ invoiceId: "inv_2" });
  });

  it("still answers when the page shares nothing", async () => {
    const { store } = renderWidgetTools({});
    expect(await invoke(store())).toBe("The page does not share any context.");
  });

  it("uses replacement components", () => {
    const MyAskUser = () => null;
    const { store } = renderWidgetTools({ components: { askUser: MyAskUser } });
    expect(store().resolveComponent(ref(WIDGET_TOOL_IDS.askUser))).toBe(MyAskUser);
    expect(store().resolveComponent(ref(WIDGET_TOOL_IDS.displayDetails))).toBe(DisplayDetails);
  });

  it("renders an ask_user call in a ConversationsPanel with no other wiring", async () => {
    const at = "2026-08-14T00:00:00Z";
    const tool = { id: "tool_ask", name: "Ask user", externalId: WIDGET_TOOL_IDS.askUser };
    const conversation: WidgetConversation = {
      id: "c1",
      state: "STATE_OPEN",
      title: "Conversation c1",
      createdAt: at,
      lastActiveAt: at,
    };
    const history = [
      { id: "e1", conversationId: "c1", createdAt: at, type: "userMessage", userMessage: { content: "Help me pick" } },
      {
        id: "e2",
        conversationId: "c1",
        createdAt: at,
        type: "toolCalled",
        toolCalled: {
          toolCallId: "tc1",
          tool,
          arguments: {
            questions: [
              {
                id: "plan",
                question: "Which plan?",
                element: {
                  type: "radio_buttons",
                  options: [
                    { value: "basic", text: "Basic" },
                    { value: "pro", text: "Pro" },
                  ],
                },
              },
            ],
          },
        },
      },
    ] as WidgetEvent[];
    const { client } = createMockClient({ latency: 0, conversations: [conversation], events: { c1: history } });

    render(
      <WidgetClientProvider client={client}>
        <PageToolsProvider>
          <WidgetTools />
          <ConversationsPanel toolPlacement="inline" />
        </PageToolsProvider>
      </WidgetClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Conversation c1" }));

    expect(await screen.findByText("Which plan?")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Pro" })).toBeTruthy();
  });
});
