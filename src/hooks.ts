"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { CadenyaWidgets, WidgetConfig, WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import { useWidgetClient } from "./context.js";
import { applyEvent, applyEvents, type TimelineItem } from "./timeline.js";
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
  client: CadenyaWidgets;
  conversationId: string | null;
  timeline: TimelineItem[];
  loading: boolean;
  error: string | null;
};

type ThreadAction =
  | { type: "reset"; client: CadenyaWidgets; conversationId: string | null }
  | { type: "backfilled"; events: WidgetEvent[] }
  | { type: "event"; event: WidgetEvent }
  | { type: "error"; message: string };

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "reset":
      return {
        client: action.client,
        conversationId: action.conversationId,
        timeline: [],
        loading: action.conversationId != null,
        error: null,
      };
    case "backfilled":
      return { ...state, timeline: applyEvents(state.timeline, action.events), loading: false };
    case "event":
      return { ...state, timeline: applyEvent(state.timeline, action.event) };
    case "error":
      return { ...state, loading: false, error: action.message };
  }
}

export interface UseConversationResult {
  timeline: TimelineItem[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  /** Send the next visitor message on this conversation. */
  send: (message: string) => Promise<void>;
  approveToolCall: (toolCallId: string) => Promise<void>;
  denyToolCall: (toolCallId: string) => Promise<void>;
  /** Supply a bare tool call's result; arrives back as a toolResult event. */
  setToolCallContent: (toolCallId: string, content: string) => Promise<void>;
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
    loading: id != null,
    error: null,
  }));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    dispatch({ type: "reset", client, conversationId });
    if (!conversationId) return;

    const controller = new AbortController();

    void subscribeToConversation({
      client,
      conversationId,
      signal: controller.signal,
      onHistory: (events) => dispatch({ type: "backfilled", events }),
      onEvent: (event) => dispatch({ type: "event", event }),
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });

    return () => controller.abort();
  }, [client, conversationId]);

  const send = useCallback(
    async (message: string) => {
      if (!conversationId) return;
      setSending(true);
      try {
        await client.conversations.continue(conversationId, { message });
        // The user message itself arrives back through the event stream.
      } finally {
        setSending(false);
      }
    },
    [client, conversationId],
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
    timeline: current ? state.timeline : [],
    loading: current ? state.loading : conversationId != null,
    error: current ? state.error : null,
    sending,
    send,
    approveToolCall,
    denyToolCall,
    setToolCallContent,
  };
}
