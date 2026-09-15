import type { CadenyaWidgets, WidgetEvent } from "@cadenya/widgets";

type Subscription = {
  client: CadenyaWidgets;
  conversationId: string;
  signal: AbortSignal;
  onHistory: (events: WidgetEvent[]) => void;
  onEvent: (event: WidgetEvent) => void;
  onReconnecting?: (reconnecting: boolean) => void;
};

const MAX_RETRY_DELAY = 15_000;

function retryDelay(attempt: number) {
  return Math.min(1000 * 2 ** Math.min(attempt, 4), MAX_RETRY_DELAY);
}

/** Most 4xx responses need a user or configuration change before retrying. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Publish history atomically: a tool's result can be on a later page. */
async function loadHistory({ client, conversationId, signal, onHistory }: Subscription) {
  const events: WidgetEvent[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.conversations.listEvents(conversationId, { cursor }, { signal });
    if (signal.aborted) return;
    for (const event of page.items) events.push(event);
    cursor = page.nextCursor;
  } while (cursor);
  onHistory(events);
  return events.at(-1)?.id;
}

/** Resolve immediately on cancellation and release both timer and listener. */
function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function streamTail(
  { client, conversationId, signal, onEvent, onReconnecting }: Subscription,
  lastEventId: string | undefined,
): Promise<void> {
  let attempts = 0;
  while (!signal.aborted) {
    try {
      // Own the outer recovery loop so its lifetime follows the component,
      // rather than the SDK's per-outage retry budget.
      const stream = await client.conversations.streamEvents(conversationId, {
        signal,
        lastEventId,
        reconnect: false,
      });
      if (signal.aborted) return;
      onReconnecting?.(false);
      for await (const event of stream) {
        if (signal.aborted) return;
        attempts = 0;
        lastEventId = event.id;
        onEvent(event);
      }
      // Open/ping frames skipped by the SDK can still advance its checkpoint.
      lastEventId = stream.lastEventId ?? lastEventId;
    } catch (error) {
      if (signal.aborted) return;
      if (!isRetryable(error)) throw error;
    }
    if (signal.aborted) return;
    onReconnecting?.(true);
    await waitForRetry(retryDelay(attempts++), signal);
  }
}

/** Keep history and its resumed event stream alive until explicitly cancelled. */
export async function subscribeToConversation(subscription: Subscription): Promise<void> {
  let attempts = 0;
  while (!subscription.signal.aborted) {
    try {
      const lastEventId = await loadHistory(subscription);
      if (subscription.signal.aborted) return;
      subscription.onReconnecting?.(false);
      await streamTail(subscription, lastEventId);
      return;
    } catch (error) {
      if (subscription.signal.aborted) return;
      if (!isRetryable(error)) throw error;
      subscription.onReconnecting?.(true);
      await waitForRetry(retryDelay(attempts++), subscription.signal);
    }
  }
}
