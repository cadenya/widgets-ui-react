"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CadenyaWidgets, WidgetConfig, WidgetConversation, WidgetEvent, WidgetQueuedMessage } from "@cadenya/widgets";
import { useWidgetClient } from "./context.js";
import { applyEvent, applyEvents, type TimelineItem } from "./timeline.js";
import { applyLifecycle, emptyLifecycle, HEARTBEAT_FRESHNESS_MS, type Lifecycle, type ObjectiveState } from "./lifecycle.js";
import { subscribeToConversation } from "./conversation-stream.js";

/** Widget display metadata (name for the header). */
export function useWidgetConfig(): WidgetConfig | null {
  const client = useWidgetClient();
  const [config, setConfig] = useState<WidgetConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.config.retrieveWidget().then(
      (c) => {
        if (!cancelled) setConfig(c);
      },
      () => {
        // Config is cosmetic; render without it.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  return config;
}

export interface UseConversationsResult {
  conversations: WidgetConversation[];
  loading: boolean;
  error: string | null;
  /** Start a conversation with the visitor's first message. */
  create: (message: string) => Promise<WidgetConversation>;
  refresh: () => Promise<void>;
}

export function useConversations(): UseConversationsResult {
  const client = useWidgetClient();
  const [conversations, setConversations] = useState<WidgetConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const page = await client.conversations.list();
      setConversations(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (message: string) => {
      const conversation = await client.conversations.create({ message });
      setConversations((prev) => [conversation, ...prev]);
      return conversation;
    },
    [client],
  );

  return { conversations, loading, error, create, refresh };
}

type ThreadState = {
  lifecycle: Lifecycle;
  client: CadenyaWidgets;
  conversationId: string | null;
  timeline: TimelineItem[];
  loading: boolean;
  error: string | null;
  reconnecting: boolean;
};

type ThreadAction =
  | { type: "reset"; client: CadenyaWidgets; conversationId: string | null }
  | { type: "backfilled"; events: WidgetEvent[] }
  | { type: "event"; event: WidgetEvent }
  | { type: "snapshot"; conversation: WidgetConversation }
  | { type: "expired"; at: number }
  | { type: "reconnecting"; reconnecting: boolean }
  | { type: "error"; message: string };

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "reset":
      if (state.client === action.client && state.conversationId === action.conversationId) {
        return {
          ...state,
          loading: action.conversationId != null && state.timeline.length === 0,
          error: null,
          reconnecting: false,
        };
      }
      return {
        client: action.client,
        conversationId: action.conversationId,
        timeline: [],
        lifecycle: emptyLifecycle,
        loading: action.conversationId != null,
        error: null,
        reconnecting: false,
      };
    case "backfilled":
      return { ...state, timeline: applyEvents(state.timeline, action.events), lifecycle: action.events.reduce((life, event) => applyLifecycle(life, event, false), state.lifecycle), loading: false };
    case "event":
      return { ...state, timeline: applyEvent(state.timeline, action.event), lifecycle: applyLifecycle(state.lifecycle, action.event, true) };
    case "snapshot":
      return state.lifecycle.stateEventId ? state : { ...state, lifecycle: { ...state.lifecycle, conversationState: action.conversation.state } };
    case "expired":
      return state.lifecycle.lastHeartbeatAt !== action.at ? state : { ...state, lifecycle: { ...state.lifecycle, lastHeartbeatAt: null } };
    case "reconnecting":
      return { ...state, reconnecting: action.reconnecting };
    case "error":
      return { ...state, loading: false, reconnecting: false, error: action.message };
  }
}

export interface SendOptions {
  /** Queue the message when the agent is responding instead of rejecting it. */
  enqueue?: boolean;
}

type QueueState = {
  client: CadenyaWidgets;
  conversationId: string | null;
  items: WidgetQueuedMessage[];
};

export interface UseConversationResult {
  /** Precise lifecycle once observed in history or the live stream. */
  objectiveState: ObjectiveState | null;
  conversationState: WidgetConversation["state"] | null;
  /** Recent execution anywhere in this objective tree; independent of lifecycle. */
  isWorkerActive: boolean;
  lastHeartbeatAt: number | null;
  /** Undefined until authoritative state is available. */
  responding: boolean | undefined;
  timeline: TimelineItem[];
  loading: boolean;
  error: string | null;
  /** Whether the live event stream is waiting to reconnect. */
  reconnecting: boolean;
  sending: boolean;
  /**
   * Send the next visitor message on this conversation. With `enqueue`, a
   * message sent while the agent is responding is queued for its next reply
   * instead of rejected; it shows in `queuedMessages` until the agent picks
   * it up.
   */
  send: (message: string, options?: SendOptions) => Promise<void>;
  /** Messages waiting for the agent to finish responding, oldest first. */
  queuedMessages: WidgetQueuedMessage[];
  /** Remove a queued message before the agent picks it up. */
  removeQueuedMessage: (queuedMessageId: string) => Promise<void>;
  approveToolCall: (toolCallId: string) => Promise<void>;
  denyToolCall: (toolCallId: string) => Promise<void>;
  /** Supply a bare tool call's result; arrives back as a toolResult event. */
  setToolCallContent: (toolCallId: string, content: string) => Promise<void>;
  /** Retry after a non-recoverable subscription error. */
  retry: () => void;
}

/**
 * Loads a conversation's event history (all pages, oldest first), then keeps
 * it live over SSE, reconnecting with Last-Event-ID so nothing is missed.
 *
 * A null id is the idle "new conversation" state: an empty timeline, not
 * loading, no error. Switching from a conversation to null tears down its
 * stream and clears its timeline and error, so a composer bound to
 * `loading` is usable for the first message.
 */
export function useConversation(conversationId: string | null): UseConversationResult {
  const client = useWidgetClient();
  const [state, dispatch] = useReducer(threadReducer, conversationId, (id) => ({
    client,
    conversationId: id,
    timeline: [],
    lifecycle: emptyLifecycle,
    loading: id != null,
    error: null,
    reconnecting: false,
  }));
  const [sending, setSending] = useState(false);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const [queue, setQueue] = useState<QueueState>({ client, conversationId, items: [] });
  const queueRequest = useRef(0);

  // Only the latest fetch may land, so a slow response never overwrites a
  // newer one, and none land after the conversation changes.
  const refreshQueue = useCallback(async () => {
    if (!conversationId) return;
    const request = ++queueRequest.current;
    try {
      const page = await client.conversations.listQueuedMessages(conversationId, { state: "STATE_QUEUED", limit: 100 });
      if (request === queueRequest.current) setQueue({ client, conversationId, items: page.items });
    } catch {
      // The queue is advisory; the thread stays usable if it cannot load.
    }
  }, [client, conversationId]);
  const refreshQueueRef = useRef(refreshQueue);
  useEffect(() => {
    refreshQueueRef.current = refreshQueue;
  });

  // A queue tagged with another conversation reads as empty until this loads.
  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    dispatch({ type: "reset", client, conversationId });
    if (!conversationId) return;

    const controller = new AbortController();

    // Old conversations may predate durable state-change events. Their
    // snapshot is a fallback and cannot overwrite an observed transition.
    void (async () => {
      try {
        const conversation = await client.conversations.retrieve(conversationId, { signal: controller.signal });
        if (!controller.signal.aborted) dispatch({ type: "snapshot", conversation });
      } catch { /* History and live transitions remain usable if refresh fails. */ }
    })();

    void subscribeToConversation({
      client,
      conversationId,
      signal: controller.signal,
      onHistory: (events) => dispatch({ type: "backfilled", events }),
      onEvent: (event) => {
        dispatch({ type: "event", event });
        // A queued message leaves the queue by becoming a userMessage event,
        // or by being discarded when the conversation closes.
        if (event.type === "userMessage" || event.type === "stateChanged") void refreshQueueRef.current();
      },
      onReconnecting: (reconnecting) => dispatch({ type: "reconnecting", reconnecting }),
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });

    return () => controller.abort();
  }, [client, conversationId, subscriptionAttempt]);

  const retry = useCallback(() => setSubscriptionAttempt((attempt) => attempt + 1), []);

  useEffect(() => {
    const at = state.lifecycle.lastHeartbeatAt;
    if (at === null) return;
    const timer = setTimeout(() => dispatch({ type: "expired", at }), Math.max(0, at + HEARTBEAT_FRESHNESS_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [state.lifecycle.lastHeartbeatAt]);

  const send = useCallback(
    async (message: string, options?: SendOptions) => {
      if (!conversationId) return;
      setSending(true);
      try {
        const result = await client.conversations.continue(conversationId, { message, enqueue: options?.enqueue });
        // A sent message arrives back through the event stream; a queued one
        // is shown until the agent picks it up.
        if (result.type === "queuedMessage") {
          const queued = result.queuedMessage;
          setQueue((current) =>
            current.client !== client || current.conversationId !== conversationId || current.items.some((item) => item.id === queued.id)
              ? current
              : { ...current, items: [...current.items, queued] },
          );
        }
      } finally {
        setSending(false);
      }
    },
    [client, conversationId],
  );

  const removeQueuedMessage = useCallback(
    async (queuedMessageId: string) => {
      if (!conversationId) return;
      setQueue((current) => ({ ...current, items: current.items.filter((item) => item.id !== queuedMessageId) }));
      try {
        await client.conversations.removeQueuedMessage(conversationId, { queuedMessageId });
      } catch (err) {
        // The agent may have picked the message up first; the server's queue
        // is the truth either way.
        await refreshQueue();
        throw err;
      }
    },
    [client, conversationId, refreshQueue],
  );

  const approveToolCall = useCallback(
    async (toolCallId: string) => {
      if (!conversationId) return;
      await client.conversations.approveToolCall(conversationId, { toolCallId });
    },
    [client, conversationId],
  );

  const denyToolCall = useCallback(
    async (toolCallId: string) => {
      if (!conversationId) return;
      await client.conversations.denyToolCall(conversationId, { toolCallId });
    },
    [client, conversationId],
  );

  const setToolCallContent = useCallback(
    async (toolCallId: string, content: string) => {
      if (!conversationId) return;
      await client.conversations.setToolCallContent(conversationId, { toolCallId, content });
    },
    [client, conversationId],
  );

  // Do not expose the previous conversation during the render before effect cleanup.
  const current = state.client === client && state.conversationId === conversationId;
  return {
    objectiveState: current ? state.lifecycle.objectiveState : null,
    conversationState: current ? state.lifecycle.conversationState : null,
    lastHeartbeatAt: current ? state.lifecycle.lastHeartbeatAt : null,
    isWorkerActive: current && state.lifecycle.lastHeartbeatAt !== null,
    responding: current && state.lifecycle.conversationState && state.lifecycle.conversationState !== "STATE_UNSPECIFIED"
      ? state.lifecycle.conversationState === "STATE_RESPONDING" : undefined,
    timeline: current ? state.timeline : [],
    loading: current ? state.loading : conversationId != null,
    error: current ? state.error : null,
    reconnecting: current ? state.reconnecting : false,
    sending,
    send,
    queuedMessages: queue.client === client && queue.conversationId === conversationId ? queue.items : [],
    removeQueuedMessage,
    approveToolCall,
    denyToolCall,
    setToolCallContent,
    retry,
  };
}
