import { afterEach, describe, expect, it, vi } from "vitest";
import type { CadenyaWidgets, WidgetEvent } from "@cadenya/widgets";
import { subscribeToConversation } from "./conversation-stream.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const event = (id: string) => ({ id } as WidgetEvent);
const emptyStream = () => ({ async *[Symbol.asyncIterator]() {} });

function setup() {
  const controller = new AbortController();
  const listEvents = vi.fn().mockResolvedValue({ items: [event("e1")] });
  const streamEvents = vi.fn().mockResolvedValue(emptyStream());
  const onHistory = vi.fn();
  const onEvent = vi.fn();
  const onReconnecting = vi.fn();
  const run = () => subscribeToConversation({
    client: { conversations: { listEvents, streamEvents } } as unknown as CadenyaWidgets,
    conversationId: "c1", signal: controller.signal, onHistory, onEvent, onReconnecting,
  });
  return { controller, listEvents, streamEvents, onHistory, onEvent, onReconnecting, run };
}

afterEach(() => vi.useRealTimers());

describe("conversation subscription", () => {
  it("publishes all history together and resumes after the final page", async () => {
    const s = setup();
    const page = deferred<{ items: WidgetEvent[] }>();
    s.listEvents.mockResolvedValueOnce({ items: [event("e1")], nextCursor: "page2" })
      .mockReturnValueOnce(page.promise);
    s.streamEvents.mockImplementation(async () => { s.controller.abort(); return emptyStream(); });
    const running = s.run();
    await vi.waitFor(() => expect(s.listEvents).toHaveBeenCalledTimes(2));
    expect(s.onHistory).not.toHaveBeenCalled();
    expect(s.streamEvents).not.toHaveBeenCalled();
    page.resolve({ items: [event("e2")] });
    await running;
    expect(s.onHistory).toHaveBeenCalledExactlyOnceWith([event("e1"), event("e2")]);
    expect(s.streamEvents).toHaveBeenCalledWith("c1", {
      signal: s.controller.signal, lastEventId: "e2", reconnect: false,
    });
    expect(s.listEvents).toHaveBeenLastCalledWith("c1", { cursor: "page2" }, { signal: s.controller.signal });
  });

  it("ignores late history and stops pagination after cancellation", async () => {
    const s = setup();
    const page = deferred<{ items: WidgetEvent[]; nextCursor: string }>();
    s.listEvents.mockReturnValueOnce(page.promise);
    const running = s.run();
    s.controller.abort();
    page.resolve({ items: [event("stale")], nextCursor: "more" });
    await running;
    expect(s.onHistory).not.toHaveBeenCalled();
    expect(s.listEvents).toHaveBeenCalledTimes(1);
    expect(s.streamEvents).not.toHaveBeenCalled();
  });

  it("ignores events yielded after cancellation", async () => {
    const s = setup();
    s.streamEvents.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        s.controller.abort();
        yield event("stale");
      },
    });
    await s.run();
    expect(s.onEvent).not.toHaveBeenCalled();
  });

  it("reconnects using the SDK checkpoint and releases the backoff timer on abort", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.streamEvents.mockResolvedValue({ ...emptyStream(), lastEventId: "ping-checkpoint" });
    const running = s.run();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.streamEvents).toHaveBeenCalledTimes(2);
    expect(s.streamEvents.mock.calls[1][1].lastEventId).toBe("ping-checkpoint");
    expect(s.onReconnecting).toHaveBeenCalledWith(true);
    s.controller.abort();
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps retrying through a prolonged outage with a bounded delay", async () => {
    vi.useFakeTimers();
    const s = setup();
    const running = s.run();
    await vi.advanceTimersByTimeAsync(80_000);
    expect(s.streamEvents.mock.calls.length).toBeGreaterThan(6);
    s.controller.abort();
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers after repeated failures and clears the reconnecting state", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.streamEvents
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          yield event("e2");
          await new Promise<void>((resolve) =>
            s.controller.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
      });
    const running = s.run();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.onEvent).toHaveBeenCalledExactlyOnceWith(event("e2"));
    expect(s.streamEvents.mock.calls.map((call) => call[1].lastEventId)).toEqual([
      "e1",
      "e1",
      "e1",
    ]);
    expect(s.onReconnecting.mock.calls.map(([value]) => value)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    s.controller.abort();
    await running;
  });

  it("retries interrupted history before publishing it atomically", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.listEvents
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [event("e1")] });
    s.streamEvents.mockImplementation(async () => {
      s.controller.abort();
      return emptyStream();
    });
    const running = s.run();
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(s.listEvents).toHaveBeenCalledTimes(2);
    expect(s.onHistory).toHaveBeenCalledExactlyOnceWith([event("e1")]);
  });

  it("stops automatically for a non-recoverable response", async () => {
    const s = setup();
    s.streamEvents.mockRejectedValue(Object.assign(new Error("Conversation not found"), { status: 404 }));
    await expect(s.run()).rejects.toThrow("Conversation not found");
    expect(s.streamEvents).toHaveBeenCalledTimes(1);
    expect(s.onReconnecting).not.toHaveBeenCalledWith(true);
  });
});
