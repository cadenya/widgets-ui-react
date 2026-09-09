import type { WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import fakerEvents from "../__fixtures__/faker-conversation.json";
import { applyEvents, type TimelineItem } from "../timeline.js";
import { RESOURCE_CARDS, TOOLS } from "./mock-client.js";

/** A real captured conversation against the Faker demo agent (31 events). */
export const FAKER_EVENTS = fakerEvents as WidgetEvent[];
export const FAKER_CONVERSATION_ID = FAKER_EVENTS[0].conversationId;

export const FAKER_CONVERSATION: WidgetConversation = {
  id: FAKER_CONVERSATION_ID,
  state: "STATE_OPEN",
  title: "Hi! What can you help me with?",
  createdAt: FAKER_EVENTS[0].createdAt,
  lastActiveAt: FAKER_EVENTS.at(-1)!.createdAt,
};

export const FAKER_TIMELINE: TimelineItem[] = applyEvents([], FAKER_EVENTS);

function conv(id: string, title: string, minutesAgo: number, state: WidgetConversation["state"] = "STATE_OPEN"): WidgetConversation {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return { id, state, title, createdAt: at, lastActiveAt: at };
}

/**
 * A finished conversation whose tool calls are resource cards, for the
 * inline-placement stories: reopening it must show the cards with their
 * arguments and results, without re-running anything.
 */
export const CARDS_CONVERSATION_ID = "obj_01STORY00000000000000CARDS";
export const CARDS_CONVERSATION: WidgetConversation = conv(CARDS_CONVERSATION_ID, "Show my agents as cards", 25);

export const CARDS_EVENTS: WidgetEvent[] = (() => {
  let t = Date.now() - 60_000 * 25;
  let n = 0;
  const ev = (partial: Record<string, unknown>): WidgetEvent => {
    t += 1_500;
    n += 1;
    return {
      id: `objevt_CARDS${String(n).padStart(4, "0")}`,
      conversationId: CARDS_CONVERSATION_ID,
      createdAt: new Date(t).toISOString(),
      ...partial,
    } as WidgetEvent;
  };
  const out: WidgetEvent[] = [
    ev({ type: "userMessage", userMessage: { content: "Show my agents as cards" } }),
    ev({ type: "assistantMessage", assistantMessage: { content: "" } }),
  ];
  RESOURCE_CARDS.forEach((card, i) => {
    const toolCallId = `toolcall_CARDS${i}`;
    out.push(
      ev({ type: "toolCalled", toolCalled: { toolCallId, tool: TOOLS.displayResource, arguments: card } }),
      ev({ type: "toolResult", toolResult: { toolCallId, tool: TOOLS.displayResource, content: { presented: true } } }),
    );
  });
  out.push(ev({ type: "assistantMessage", assistantMessage: { content: "That's both of them. Want details on either?" } }));
  return out;
})();

/** A sidebar's worth of past conversations, one of them still responding. */
export const CONVERSATIONS: WidgetConversation[] = [
  conv("obj_01STORY000000000000000001", "Where is my order?", 3, "STATE_RESPONDING"),
  FAKER_CONVERSATION,
  CARDS_CONVERSATION,
  conv("obj_01STORY000000000000000002", "Change my shipping address to 42 Wallaby Way, Sydney", 90),
  conv("obj_01STORY000000000000000003", "Refund request", 60 * 5),
  conv("obj_01STORY000000000000000004", "", 60 * 26),
  conv("obj_01STORY000000000000000005", "How do I connect the Faker MCP server to my workspace?", 60 * 50, "STATE_CLOSED"),
];

/** Short scripted history for the non-fixture conversations above. */
function history(conversationId: string, turns: Array<["user" | "assistant", string]>): WidgetEvent[] {
  let t = Date.now() - 60_000 * 10;
  return turns.map(([role, content], i) => {
    t += 4_000;
    const base = { id: `objevt_${conversationId.slice(-8)}${String(i).padStart(4, "0")}`, conversationId, createdAt: new Date(t).toISOString() };
    return role === "user"
      ? ({ ...base, type: "userMessage", userMessage: { content } } as WidgetEvent)
      : ({ ...base, type: "assistantMessage", assistantMessage: { content } } as WidgetEvent);
  });
}

export const CONVERSATION_EVENTS: Record<string, WidgetEvent[]> = {
  [CARDS_CONVERSATION_ID]: CARDS_EVENTS,
  [FAKER_CONVERSATION_ID]: FAKER_EVENTS,
  obj_01STORY000000000000000001: history("obj_01STORY000000000000000001", [
    ["user", "Where is my order? It's been a week."],
    ["assistant", "Sorry about the wait! Let me look up your most recent order."],
    ["user", "It's ord_8891."],
  ]),
  obj_01STORY000000000000000002: history("obj_01STORY000000000000000002", [
    ["user", "Change my shipping address to 42 Wallaby Way, Sydney"],
    ["assistant", "Done — future orders will ship to **42 Wallaby Way, Sydney**. Anything else?"],
  ]),
  obj_01STORY000000000000000003: history("obj_01STORY000000000000000003", [
    ["user", "Refund request"],
    ["assistant", "I can help with that. Which order would you like refunded?"],
  ]),
  obj_01STORY000000000000000004: history("obj_01STORY000000000000000004", [["user", "hi"]]),
  obj_01STORY000000000000000005: history("obj_01STORY000000000000000005", [
    ["user", "How do I connect the Faker MCP server to my workspace?"],
    [
      "assistant",
      "Head to **Settings → Integrations → MCP servers** and add `https://faker.example.com/mcp`. " +
        "Once it's connected, its tools show up under *Tools* and you can attach them to any agent.\n\n" +
        "| Step | Where |\n|---|---|\n| Add server | Settings → Integrations |\n| Attach tools | Agent → Tools |",
    ],
  ]),
};

/** Markdown that stresses every element the assistant bubble styles. */
export const MARKDOWN_KITCHEN_SINK = `# Heading one
## Heading two

A paragraph with **bold**, *italic*, ~~strike~~, \`inline code\`, and a [link](https://cadenya.com).

> A blockquote that goes on for a little while so it wraps onto a second line inside the bubble.

- Unordered item
- Another item
  - Nested item
1. Ordered one
2. Ordered two

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Column | Value |
|---|---|
| Alpha | 1 |
| Beta | 22 |
| Gamma | 333 |

---

- [x] Task done
- [ ] Task pending
`;
