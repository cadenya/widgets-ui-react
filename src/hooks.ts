"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { WidgetConfig, WidgetConversation, WidgetEvent } from "@cadenya/widgets";
import { useWidgetClient } from "./context";
import { applyEvent, applyEvents, type TimelineItem } from "./timeline";

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
  timeline: TimelineItem[];
  loading: boolean;
  error: string | null;
};

type ThreadAction =
  | { type: "reset" }
  | { type: "backfilled"; events: WidgetEvent[] }
  | { type: "event"; event: WidgetEvent }
  | { type: "error"; message: string };

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "reset":
      return { timeline: [], loading: true, error: null };
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
 */
export function useConversation(conversationId: string | null): UseConversationResult {
  const client = useWidgetClient();
  const [state, dispatch] = useReducer(threadReducer, {
    timeline: [],
    loading: true,
    error: null,
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    dispatch({ type: "reset" });

    const controller = new AbortController();

    (async () => {
      // Backfill the full history so the stream only has to carry the tail.
      let lastEventId: string | undefined;
      try {
        let cursor: string | undefined;
        do {
          const page = await client.conversations.listEvents(conversationId, { cursor });
          dispatch({ type: "backfilled", events: page.items });
          lastEventId = page.items.at(-1)?.id ?? lastEventId;
          cursor = page.nextCursor;
        } while (cursor);
      } catch (err) {
        if (controller.signal.aborted) return;
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
        return;
      }

      // Live tail. The SDK owns mid-stream transport drops (auto-reconnect
      // with Last-Event-ID resume) and skips open/ping frames, so everything
      // yielded is a real widget event and iteration only ends on a clean
      // server EOF or exhausted SDK retries. Those are ours: reconnect with
      // the last seen event id, backing off when a connection ends without
      // progress so a server that kills the stream at the same event can't
      // induce a tight reconnect loop.
      let attempts = 0;
      while (!controller.signal.aborted) {
        let progressed = false;
        try {
          const stream = await client.conversations.streamEvents(conversationId, {
            signal: controller.signal,
            lastEventId,
          });
          for await (const event of stream) {
            progressed = true;
            attempts = 0;
            lastEventId = event.id;
            dispatch({ type: "event", event });
          }
          // Skipped frames still advance the SDK's resume checkpoint.
          lastEventId = stream.lastEventId ?? lastEventId;
        } catch {
          if (controller.signal.aborted) return;
        }
        if (controller.signal.aborted) return;
        if (!progressed) {
          attempts += 1;
          if (attempts > 5) {
            dispatch({ type: "error", message: "Lost connection to the conversation stream." });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempts, 15000)));
      }
    })();

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

  return {
    timeline: state.timeline,
    loading: state.loading,
    error: state.error,
    sending,
    send,
    approveToolCall,
    denyToolCall,
    setToolCallContent,
  };
}
