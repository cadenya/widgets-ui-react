// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CadenyaWidgets, WidgetEvent } from "@cadenya/widgets";
import { WidgetClientProvider } from "./context.js";
import { useConversation } from "./hooks.js";

function event(id: string, content: string): WidgetEvent {
  return {
    id,
    conversationId: "c",
    createdAt: "2026-08-14T00:00:00Z",
    type: "userMessage",
    userMessage: { content },
  } as WidgetEvent;
}

/**
 * A client whose history is served per conversation id and whose stream
 * stays open (yielding nothing) until aborted — enough to observe the hook's
 * loading, timeline, and teardown behavior.
 */
function fakeClient(history: Record<string, WidgetEvent[] | Error>) {
  const streams: Array<{ conversationId: string; signal: AbortSignal }> = [];
  const client = {
    conversations: {
      listEvents: vi.fn(async (conversationId: string) => {
        const entry = history[conversationId];
        if (entry instanceof Error) throw entry;
        return { items: entry ?? [], nextCursor: undefined };
      }),
      streamEvents: vi.fn(async (conversationId: string, { signal }: { signal: AbortSignal }) => {
        streams.push({ conversationId, signal });
        return {
          lastEventId: undefined,
          async *[Symbol.asyncIterator]() {
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          },
        };
      }),
    },
  };
  return { client: client as unknown as CadenyaWidgets, streams };
}

function wrapperFor(client: CadenyaWidgets) {
  return ({ children }: { children: ReactNode }) => (
    <WidgetClientProvider client={client}>{children}</WidgetClientProvider>
  );
}

describe("useConversation(null)", () => {
  it("starts idle: empty timeline, not loading, no error", () => {
    const { client } = fakeClient({});
    const { result } = renderHook(() => useConversation(null), { wrapper: wrapperFor(client) });
    expect(result.current.loading).toBe(false);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(client.conversations.listEvents).not.toHaveBeenCalled();
  });

  it("loads once given an id, and returns to idle when the id goes back to null", async () => {
    const { client, streams } = fakeClient({ c1: [event("e1", "hello")] });
    const { result, rerender } = renderHook((id: string | null) => useConversation(id), {
      wrapper: wrapperFor(client),
      initialProps: null as string | null,
    });
    expect(result.current.loading).toBe(false);

    rerender("c1");
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.timeline).toHaveLength(1);
    await waitFor(() => expect(streams).toHaveLength(1));

    rerender(null);
    expect(result.current.loading).toBe(false);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.error).toBeNull();
    // The prior conversation's stream is torn down, not left running.
    expect(streams[0].signal.aborted).toBe(true);
  });

  it("clears a prior conversation's error when switching to null", async () => {
    const { client } = fakeClient({ broken: new Error("history unavailable") });
    const { result, rerender } = renderHook((id: string | null) => useConversation(id), {
      wrapper: wrapperFor(client),
      initialProps: "broken" as string | null,
    });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toBe("history unavailable"));

    rerender(null);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.timeline).toEqual([]);
  });

  it("send/approve/deny/setToolCallContent are no-ops while idle", async () => {
    const { client } = fakeClient({});
    const { result } = renderHook(() => useConversation(null), { wrapper: wrapperFor(client) });
    await act(async () => {
      await result.current.send("hi");
      await result.current.approveToolCall("tc");
      await result.current.denyToolCall("tc");
      await result.current.setToolCallContent("tc", "done");
    });
    expect(result.current.sending).toBe(false);
  });
});

describe("useConversation async isolation", () => {
  it("does not merge a late history page into a newly selected conversation", async () => {
    const { client } = fakeClient({ c2: [event("e2", "current")] });
    let resolve!: (page: { items: WidgetEvent[]; nextCursor?: string }) => void;
    vi.mocked(client.conversations.listEvents).mockImplementationOnce(() =>
      new Promise<{ items: WidgetEvent[]; nextCursor?: string }>((done) => { resolve = done; }) as ReturnType<typeof client.conversations.listEvents>,
    );
    const { result, rerender } = renderHook((id: string | null) => useConversation(id), {
      wrapper: wrapperFor(client), initialProps: "c1" as string | null,
    });
    rerender("c2");
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => resolve({ items: [event("stale", "old")], nextCursor: "more" }));
    expect(result.current.timeline.map((item) => item.id)).toEqual(["e2"]);
    expect(client.conversations.listEvents).toHaveBeenCalledTimes(2);
    expect(client.conversations.streamEvents).toHaveBeenCalledTimes(1);
  });
});
