import type { CadenyaWidgets, WidgetEvent } from "@cadenya/widgets";

type Subscription = {
  client: CadenyaWidgets;
  conversationId: string;
  signal: AbortSignal;
  onHistory: (events: WidgetEvent[]) => void;
  onEvent: (event: WidgetEvent) => void;
};

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
  { client, conversationId, signal, onEvent }: Subscription,
  lastEventId: string | undefined,
): Promise<void> {
  let attempts = 0;
  while (!signal.aborted) {
    let progressed = false;
    try {
      const stream = await client.conversations.streamEvents(conversationId, { signal, lastEventId });
      if (signal.aborted) return;
      for await (const event of stream) {
        if (signal.aborted) return;
        progressed = true;
        attempts = 0;
        lastEventId = event.id;
        onEvent(event);
      }
      // Open/ping frames skipped by the SDK can still advance its checkpoint.
      lastEventId = stream.lastEventId ?? lastEventId;
    } catch {
      if (signal.aborted) return;
    }
    if (signal.aborted) return;
    if (!progressed && ++attempts > 5) {
      throw new Error("Lost connection to the conversation stream.");
    }
    await waitForRetry(Math.min(1000 * 2 ** attempts, 15000), signal);
  }
}

/** SDK retries transport drops; we also retry EOF/exhaustion with bounded backoff. */
export async function subscribeToConversation(subscription: Subscription): Promise<void> {
  const lastEventId = await loadHistory(subscription);
  if (subscription.signal.aborted) return;
  await streamTail(subscription, lastEventId);
}
