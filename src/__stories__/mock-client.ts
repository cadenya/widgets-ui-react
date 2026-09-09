/**
 * In-memory stand-in for the `@cadenya/widgets` client, for Storybook.
 *
 * Implements exactly the surface the hooks use (config.retrieveWidget,
 * conversations.list/create/listEvents/streamEvents/continue/approveToolCall/
 * denyToolCall/setToolCallContent) on top of a per-conversation event log,
 * and runs a scripted "agent" that answers visitor messages by emitting
 * events into that log — so the real hooks, timeline reducer, and
 * components run unmodified against a live-feeling backend.
 */
import type {
  CadenyaWidgets,
  WidgetConfig,
  WidgetConversation,
  WidgetEvent,
  WidgetToolReference,
} from "@cadenya/widgets";

// ---------------------------------------------------------------------------
// Scripting API handed to mock agents

export interface AgentContext {
  conversationId: string;
  /** The visitor message that triggered this turn. */
  message: string;
  /** All events in the conversation so far (oldest first). */
  history: () => WidgetEvent[];
  /**
   * Append an event. Omit `id` to mint one; pass an existing id to replace
   * that event in place (how streaming partials grow into their final text).
   */
  emit: (event: EventInput) => WidgetEvent;
  /** Emit an assistant message that grows word by word under one event id. */
  stream: (content: string, opts?: { delay?: number; chunk?: number }) => Promise<WidgetEvent>;
  sleep: (ms: number) => Promise<void>;
  /** Resolves when the visitor approves or denies the given tool call. */
  waitForDecision: (toolCallId: string) => Promise<"approved" | "denied">;
  /** Resolves with the content the page/tool component submits for a bare call. */
  waitForToolContent: (toolCallId: string) => Promise<string>;
  /** Fresh tool call id. */
  newToolCallId: () => string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A WidgetEvent minus the bookkeeping fields the mock fills in. */
export type EventInput = DistributiveOmit<WidgetEvent, "id" | "conversationId" | "createdAt"> & {
  id?: string;
};

export type MockAgent = (ctx: AgentContext) => Promise<void> | void;

export interface MockClientOptions {
  /** Widget display name (header). */
  displayName?: string;
  /** Preloaded conversations, newest first. */
  conversations?: WidgetConversation[];
  /** Preloaded events per conversation id, oldest first. */
  events?: Record<string, WidgetEvent[]>;
  /** Simulated round-trip latency for each request, in ms. */
  latency?: number;
  /** Make conversations.list() reject with this message. */
  listError?: string;
  /** Make conversations.listEvents() reject with this message. */
  eventsError?: string;
  /** Never resolve list()/listEvents() — the perpetual loading state. */
  hang?: boolean;
  /** How the fake agent answers visitor messages. Defaults to demoAgent. */
  agent?: MockAgent;
  /** Delay before the agent starts answering (thinking time), in ms. */
  thinkTime?: number;
}

// ---------------------------------------------------------------------------
// Ids: monotonic, ULID-shaped enough to read naturally in the UI.

let counter = 0;
function ulidish(prefix: string): string {
  counter += 1;
  const time = Date.now().toString(36).toUpperCase().padStart(9, "0");
  const seq = counter.toString(36).toUpperCase().padStart(6, "0");
  const rand = Math.random().toString(36).slice(2, 13).toUpperCase().padEnd(11, "0");
  return `${prefix}_${time}${seq}${rand}`.slice(0, prefix.length + 27);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Store

interface ConversationRecord {
  conversation: WidgetConversation;
  events: WidgetEvent[];
  subscribers: Set<(event: WidgetEvent) => void>;
}

interface Waiters {
  decisions: Map<string, (d: "approved" | "denied") => void>;
  contents: Map<string, (content: string) => void>;
}

function createStream(
  record: ConversationRecord,
  signal: AbortSignal | undefined,
  lastEventId: string | undefined,
): AsyncIterable<WidgetEvent> & { lastEventId: string | undefined } {
  // Replay anything emitted after the caller's checkpoint, then go live.
  const start = lastEventId ? record.events.findIndex((e) => e.id === lastEventId) + 1 : 0;
  const queue: WidgetEvent[] = record.events.slice(start);
  let wake: (() => void) | null = null;
  const onEvent = (event: WidgetEvent) => {
    queue.push(event);
    wake?.();
  };
  record.subscribers.add(onEvent);

  const stream = {
    lastEventId,
    async *[Symbol.asyncIterator]() {
      try {
        while (!signal?.aborted) {
          const next = queue.shift();
          if (next) {
            stream.lastEventId = next.id;
            yield next;
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
          wake = null;
        }
      } finally {
        record.subscribers.delete(onEvent);
      }
    },
  };
  return stream;
}

/**
 * Build a mock client. The returned object is cast to CadenyaWidgets so it
 * drops straight into <WidgetClientProvider client={...}>; the `mock` handle
 * lets stories drive it from outside (emit events, inspect the log).
 */
export function createMockClient(options: MockClientOptions = {}) {
  const {
    displayName = "Cadenya Assistant",
    latency = 250,
    agent = demoAgent,
    thinkTime = 600,
  } = options;

  const records = new Map<string, ConversationRecord>();
  const waiters: Waiters = { decisions: new Map(), contents: new Map() };

  for (const conversation of options.conversations ?? []) {
    records.set(conversation.id, {
      conversation: { ...conversation },
      events: [...(options.events?.[conversation.id] ?? [])],
      subscribers: new Set(),
    });
  }

  const net = async () => {
    if (options.hang) return new Promise<never>(() => {});
    if (latency > 0) await wait(latency);
  };

  const get = (id: string): ConversationRecord => {
    const record = records.get(id);
    if (!record) throw new Error(`Conversation not found: ${id}`);
    return record;
  };

  const emit = (conversationId: string, input: EventInput): WidgetEvent => {
    const record = get(conversationId);
    const existing = input.id ? record.events.findIndex((e) => e.id === input.id) : -1;
    const event = {
      ...input,
      id: input.id ?? ulidish("objevt"),
      conversationId,
      createdAt: existing >= 0 ? record.events[existing].createdAt : new Date().toISOString(),
    } as WidgetEvent;
    if (existing >= 0) record.events[existing] = event;
    else record.events.push(event);
    record.conversation.lastActiveAt = event.createdAt;
    for (const subscriber of record.subscribers) subscriber(event);
    return event;
  };

  const runAgent = async (conversationId: string, message: string) => {
    const record = get(conversationId);
    record.conversation.state = "STATE_RESPONDING";
    const ctx: AgentContext = {
      conversationId,
      message,
      history: () => [...record.events],
      emit: (input) => emit(conversationId, input),
      stream: async (content, { delay = 40, chunk = 2 } = {}) => {
        const words = content.split(/(?<=\s)/);
        let event: WidgetEvent | undefined;
        let acc = "";
        for (let i = 0; i < words.length; i += chunk) {
          acc += words.slice(i, i + chunk).join("");
          event = emit(conversationId, {
            id: event?.id,
            type: "assistantMessage",
            assistantMessage: { content: acc },
          });
          await wait(delay);
        }
        return event!;
      },
      sleep: wait,
      waitForDecision: (toolCallId) =>
        new Promise((resolve) => waiters.decisions.set(toolCallId, resolve)),
      waitForToolContent: (toolCallId) =>
        new Promise((resolve) => waiters.contents.set(toolCallId, resolve)),
      newToolCallId: () => ulidish("toolcall"),
    };
    try {
      await wait(thinkTime);
      await agent(ctx);
    } catch (err) {
      emit(conversationId, {
        type: "error",
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      record.conversation.state = "STATE_OPEN";
    }
  };

  const client = {
    config: {
      retrieveWidget: async (): Promise<WidgetConfig> => {
        await net();
        return { displayName };
      },
    },
    conversations: {
      list: async () => {
        await net();
        if (options.listError) throw new Error(options.listError);
        const items = [...records.values()]
          .map((r) => ({ ...r.conversation }))
          .sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt));
        return { items, nextCursor: undefined };
      },
      create: async ({ message }: { message: string }) => {
        await net();
        const id = ulidish("obj");
        const now = new Date().toISOString();
        records.set(id, {
          conversation: {
            id,
            state: "STATE_OPEN",
            title: message.length > 48 ? `${message.slice(0, 45)}…` : message,
            createdAt: now,
            lastActiveAt: now,
          },
          events: [],
          subscribers: new Set(),
        });
        emit(id, { type: "userMessage", userMessage: { content: message } });
        void runAgent(id, message);
        return { ...get(id).conversation };
      },
      listEvents: async (id: string, { cursor }: { cursor?: string } = {}) => {
        await net();
        if (options.eventsError) throw new Error(options.eventsError);
        const events = get(id).events;
        const start = cursor ? Number(cursor) : 0;
        const pageSize = 20;
        const items = events.slice(start, start + pageSize);
        const nextCursor = start + pageSize < events.length ? String(start + pageSize) : undefined;
        return { items, nextCursor };
      },
      streamEvents: async (
        id: string,
        { signal, lastEventId }: { signal?: AbortSignal; lastEventId?: string } = {},
      ) => {
        await net();
        return createStream(get(id), signal, lastEventId);
      },
      continue: async (id: string, { message }: { message: string }) => {
        await net();
        emit(id, { type: "userMessage", userMessage: { content: message } });
        void runAgent(id, message);
        return { ...get(id).conversation };
      },
      approveToolCall: async (_id: string, { toolCallId }: { toolCallId: string }) => {
        await net();
        waiters.decisions.get(toolCallId)?.("approved");
        waiters.decisions.delete(toolCallId);
      },
      denyToolCall: async (_id: string, { toolCallId }: { toolCallId: string }) => {
        await net();
        waiters.decisions.get(toolCallId)?.("denied");
        waiters.decisions.delete(toolCallId);
      },
      setToolCallContent: async (
        id: string,
        { toolCallId, content }: { toolCallId: string; content: string },
      ) => {
        await net();
        const record = get(id);
        const called = record.events.find(
          (e) => e.type === "toolCalled" && e.toolCalled.toolCallId === toolCallId,
        );
        const tool: WidgetToolReference =
          called?.type === "toolCalled" ? called.toolCalled.tool : { id: "tool_unknown", name: "tool" };
        let parsed: unknown = content;
        try {
          parsed = JSON.parse(content);
        } catch {
          // plain string result
        }
        emit(id, { type: "toolResult", toolResult: { toolCallId, tool, content: parsed } });
        waiters.contents.get(toolCallId)?.(content);
        waiters.contents.delete(toolCallId);
      },
    },
  };

  return {
    client: client as unknown as CadenyaWidgets,
    /** Story-side controls. */
    mock: {
      emit,
      records,
      conversationIds: () => [...records.keys()],
    },
  };
}

// ---------------------------------------------------------------------------
// Tools the scripted agents reference

export const TOOLS = {
  lookupOrder: { id: "tool_01MOCKLOOKUPORDER0000000000", name: "LookupOrder" },
  cancelOrder: { id: "tool_01MOCKCANCELORDER0000000000", name: "CancelOrder" },
  /** A page tool: the embedding page executes it. */
  setTheme: { id: "tool_01MOCKSETTHEME000000000000", externalId: "set-theme", name: "SetTheme" },
  /** A bare tool with a custom renderer that gathers input from the visitor. */
  pickDate: { id: "tool_01MOCKPICKDATE000000000000", externalId: "pick-date", name: "PickDate" },
  /** A bare, alwaysSetResult display tool: its exposed arguments are the card. */
  displayResource: {
    id: "tool_01MOCKDISPLAYRESOURCE00000",
    externalId: "display_resource",
    name: "DisplayResource",
  },
} satisfies Record<string, WidgetToolReference>;

/** Exposed arguments for a DisplayResource call. */
export interface ResourceCardArgs {
  name: string;
  resource_type: string;
  id: string;
  description?: string;
  labels?: Record<string, string>;
}

export const RESOURCE_CARDS: ResourceCardArgs[] = [
  {
    name: "Faker",
    resource_type: "agent",
    id: "agent_01MOCKFAKER000000000000000",
    description: "Generates realistic sample data on request.",
    labels: { env: "demo", team: "growth" },
  },
  {
    name: "Cadenyaception",
    resource_type: "agent",
    id: "agent_01MOCKCADENYACEPTION000000",
    description: "Browses the workspace's own resources.",
    labels: { env: "demo" },
  },
];

// ---------------------------------------------------------------------------
// Scripted agents

/** Streams a markdown reply that reflects the visitor's message. */
export const echoAgent: MockAgent = async ({ message, stream }) => {
  await stream(
    `You said:\n\n> ${message}\n\nHere's a reply with a bit of **markdown** so bubbles get exercised:\n\n` +
      `- a list item\n- another with \`inline code\`\n\n` +
      "```json\n" +
      JSON.stringify({ echoed: message, ok: true }, null, 2) +
      "\n```\n\nAnything else?",
  );
};

/** Runs a tool without approval, then replies. */
export const toolAgent: MockAgent = async ({ message, emit, stream, sleep, newToolCallId }) => {
  await stream("Let me look that up.");
  const toolCallId = newToolCallId();
  emit({
    type: "toolCalled",
    toolCalled: { toolCallId, tool: TOOLS.lookupOrder, arguments: { query: message } } as never,
  });
  await sleep(1400);
  emit({
    type: "toolResult",
    toolResult: {
      toolCallId,
      tool: TOOLS.lookupOrder,
      content: { orderId: "ord_8891", status: "shipped", eta: "2 days" },
    },
  });
  await sleep(300);
  await stream(
    "Found it — order **ord_8891** shipped and should arrive in about **2 days**. Want the tracking link?",
  );
};

/** Asks the visitor to approve a destructive tool before running it. */
export const approvalAgent: MockAgent = async ({ emit, stream, sleep, waitForDecision, newToolCallId }) => {
  await stream("I can cancel that order for you — I just need your go-ahead first.");
  const toolCallId = newToolCallId();
  emit({
    type: "toolApprovalRequested",
    toolApprovalRequested: { toolCallId, tool: TOOLS.cancelOrder },
  });
  const decision = await waitForDecision(toolCallId);
  if (decision === "denied") {
    emit({ type: "toolDenied", toolDenied: { toolCallId } });
    await sleep(300);
    await stream("No problem — I've left the order as it is. Anything else?");
    return;
  }
  emit({ type: "toolApproved", toolApproved: { toolCallId } });
  await sleep(300);
  emit({ type: "toolCalled", toolCalled: { toolCallId, tool: TOOLS.cancelOrder } });
  await sleep(1200);
  emit({ type: "toolResult", toolResult: { toolCallId, tool: TOOLS.cancelOrder } });
  await sleep(300);
  await stream("Done — the order is cancelled and a refund is on its way. 🎉");
};

/** Invokes a bare tool the page executes (usePageTool) and waits for its result. */
export const pageToolAgent: MockAgent = async ({ message, emit, stream, sleep, waitForToolContent, newToolCallId }) => {
  const wantsDark = /dark/i.test(message);
  const accent = message.match(/\b(red|blue|green|purple|orange|teal|pink|indigo|violet|crimson)\b/i)?.[1];
  await stream("Sure — updating the page now.");
  const toolCallId = newToolCallId();
  emit({
    type: "toolCalled",
    toolCalled: {
      toolCallId,
      tool: TOOLS.setTheme,
      arguments: {
        appearance: wantsDark ? "dark" : /light/i.test(message) ? "light" : undefined,
        accentColor: accent?.toLowerCase(),
      },
    } as never,
  });
  const content = await waitForToolContent(toolCallId);
  await sleep(300);
  await stream(`The page reported back: \`${content}\`. How does that look?`);
};

/** Invokes a bare tool rendered by a custom component that collects visitor input. */
export const customToolAgent: MockAgent = async ({ emit, stream, sleep, waitForToolContent, newToolCallId }) => {
  await stream("Happy to book that. Pick a date below and I'll take it from there.");
  const toolCallId = newToolCallId();
  emit({
    type: "toolCalled",
    toolCalled: {
      toolCallId,
      tool: TOOLS.pickDate,
      // Exposed arguments (the tool set's widget argument exposure overlay).
      arguments: { service: "consultation", duration: "30 min" },
    } as never,
  });
  const content = await waitForToolContent(toolCallId);
  await sleep(400);
  await stream(`Booked for **${content}**. You'll get a confirmation email shortly.`);
};

/**
 * Presents resource cards through a bare display tool that acknowledges
 * itself (alwaysSetResult), then replies — the cards are meant to outlive
 * the reply, so pair with toolPlacement="inline".
 */
export const resourceCardAgent: MockAgent = async ({ emit, stream, sleep, newToolCallId }) => {
  await stream("Here are your agents.");
  for (const card of RESOURCE_CARDS) {
    const toolCallId = newToolCallId();
    emit({
      type: "toolCalled",
      toolCalled: { toolCallId, tool: TOOLS.displayResource, arguments: card } as never,
    });
    await sleep(250);
    emit({
      type: "toolResult",
      toolResult: { toolCallId, tool: TOOLS.displayResource, content: { presented: true } },
    });
  }
  await sleep(300);
  await stream("That's both of them. Want details on either?");
};

/** Fails mid-run. */
export const errorAgent: MockAgent = async ({ emit, stream, sleep, newToolCallId }) => {
  await stream("Let me check on that.");
  const toolCallId = newToolCallId();
  emit({ type: "toolCalled", toolCalled: { toolCallId, tool: TOOLS.lookupOrder } });
  await sleep(1000);
  emit({ type: "toolError", toolError: { toolCallId, tool: TOOLS.lookupOrder } });
  await sleep(300);
  emit({ type: "error", error: { message: "The order service is unavailable right now." } });
};

/**
 * Keyword-routed demo agent so one story can show every flow:
 *   "cancel"  → approval flow      "look up" / "order" → tool run
 *   "theme"/"dark"/"light" → page tool   "book"/"date" → custom tool component
 *   "card"/"resource" → resource cards    "error"/"fail" → error notice
 *   anything else → markdown echo
 */
export const demoAgent: MockAgent = async (ctx) => {
  const m = ctx.message.toLowerCase();
  if (/cancel/.test(m)) return approvalAgent(ctx);
  if (/error|fail|break/.test(m)) return errorAgent(ctx);
  if (/theme|dark|light|accent/.test(m)) return pageToolAgent(ctx);
  if (/book|date|schedule/.test(m)) return customToolAgent(ctx);
  if (/card|resource|agents/.test(m)) return resourceCardAgent(ctx);
  if (/look ?up|order|track|status/.test(m)) return toolAgent(ctx);
  return echoAgent(ctx);
};
