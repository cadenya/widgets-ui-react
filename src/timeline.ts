import type { WidgetEvent, WidgetToolReference } from "@cadenya/widgets";

/**
 * Projection of the widget event log into renderable timeline items.
 *
 * Each item sits at the sequence of the event that created it, the order the
 * server commits events in, so an event folded late still lands in place.
 * Message and notice items are upserted by their event id (or sequence):
 * a turn interleaves several complete assistantMessage segments with tool
 * activity (each its own event/bubble), while a re-emitted id — a streaming
 * partial growing into its final content, or a replayed frame — replaces
 * in place. Tool events fold into one item per toolCallId tracking the
 * call's lifecycle.
 */

export type TimelineItem = MessageItem | ToolItem | NoticeItem;

export interface MessageItem {
  kind: "message";
  /** The producing event's id (ULID). */
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;  /** Commit-ordered position of the event that created the item. */
  sequence?: number;
  /**
   * True while the assistant's text is still arriving as deltas. The item
   * is replaced by the durable assistantMessage once it lands.
   */
  streaming?: boolean;
}

/** Id prefix of the in-progress bubble built from a completion's deltas. */
export const STREAMING_ITEM_PREFIX = "streaming-";

export type ToolStatus =
  | "approvalRequested"
  | "approved"
  | "denied"
  | "running"
  | "done"
  | "failed";

export interface ToolItem {
  kind: "tool";
  id: string;
  toolCallId: string;
  tool?: WidgetToolReference;
  status: ToolStatus;
  /** Result payload, only for tools opted into sharing content. */
  content?: unknown;
  /** Call arguments, only for tools opted into sharing arguments. */
  args?: unknown;
  createdAt: string;  /** Commit-ordered position of the event that created the item. */
  sequence?: number;
}

export interface NoticeItem {
  kind: "notice";
  id: string;
  notice: "error" | "cancelled" | "timedOut";
  message?: string;
  createdAt: string;  /** Commit-ordered position of the event that created the item. */
  sequence?: number;
}

export function applyEvents(items: TimelineItem[], events: WidgetEvent[]): TimelineItem[] {
  let next = items;
  for (const event of events) {
    next = applyEvent(next, event);
  }
  return next;
}

export function applyEvent(items: TimelineItem[], event: WidgetEvent): TimelineItem[] {
  switch (event.type) {
    case "userMessage":
      return upsertById(items, {
        kind: "message",
        id: event.id,
        role: "user",
        content: event.userMessage.content,
        createdAt: event.createdAt,
        sequence: event.sequence,
      });
    case "assistantMessageDelta":
      return appendDelta(items, event.createdAt, event.assistantMessageDelta.completionId, event.assistantMessageDelta.text);
    case "assistantMessage":
      // The durable message replaces its completion's streamed text. Any
      // other streaming bubble belongs to a completion that was retried
      // under a new id and will never be finalized.
      return upsertById(dropStreaming(items), {
        kind: "message",
        id: event.id,
        role: "assistant",
        // Tool-only assistant events may omit or null content on the wire,
        // despite the generated SDK type declaring it as a string.
        content: event.assistantMessage.content ?? "",
        createdAt: event.createdAt,
        sequence: event.sequence,
      });

    case "toolApprovalRequested":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolApprovalRequested.toolCallId, {
        status: "approvalRequested",
        tool: event.toolApprovalRequested.tool,
      });
    case "toolApproved":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolApproved.toolCallId, {
        status: "approved",
      });
    case "toolDenied":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolDenied.toolCallId, {
        status: "denied",
      });
    case "toolCalled":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolCalled.toolCallId, {
        status: "running",
        tool: event.toolCalled.tool,
        args: toolCallArgs(event.toolCalled),
      });
    case "toolResult":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolResult.toolCallId, {
        status: "done",
        tool: event.toolResult.tool,
        content: event.toolResult.content,
      });
    case "toolError":
      return upsertTool(items, event.id, event.createdAt, event.sequence, event.toolError.toolCallId, {
        status: "failed",
        tool: event.toolError.tool,
      });

    // A run that ends without an assistant message leaves its streamed text
    // unfinished, so it is dropped.
    case "error":
      return upsertById(dropStreaming(items), {
        kind: "notice",
        id: event.id,
        notice: "error",
        message: event.error.message,
        createdAt: event.createdAt,
        sequence: event.sequence,
      });
    case "cancelled":
      return upsertById(dropStreaming(items), {
        kind: "notice",
        id: event.id,
        notice: "cancelled",
        createdAt: event.createdAt,
        sequence: event.sequence,
      });
    case "timedOut":
      return upsertById(dropStreaming(items), {
        kind: "notice",
        id: event.id,
        notice: "timedOut",
        createdAt: event.createdAt,
        sequence: event.sequence,
      });

    case "stateChanged": {
      const state = event.stateChanged.toState;
      const working = state === "WIDGET_OBJECTIVE_STATE_PENDING" || state === "WIDGET_OBJECTIVE_STATE_RUNNING";
      return working ? items : dropStreaming(items);
    }

    default:
      // Forward compatibility: unknown event types render nothing.
      return items;
  }
}

/**
 * Grows the streaming bubble for a completion. Fragments arrive in order
 * and only when the stream saw the completion from its start (the server
 * enforces both), so appending is enough. The bubble has no sequence: it
 * belongs after everything delivered so far, and it is replaced by the
 * durable message before anything newer lands.
 */
function appendDelta(items: TimelineItem[], createdAt: string, completionId: string, text: string): TimelineItem[] {
  const id = STREAMING_ITEM_PREFIX + completionId;
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return [...items, { kind: "message", id, role: "assistant", content: text, createdAt, streaming: true }];
  }
  return items.map((item, i) => (i === index && item.kind === "message" ? { ...item, content: item.content + text } : item));
}

/** Removes every streaming bubble. */
export function dropStreaming(items: TimelineItem[]): TimelineItem[] {
  return items.some(isStreaming) ? items.filter((item) => !isStreaming(item)) : items;
}

function isStreaming(item: TimelineItem): boolean {
  return item.kind === "message" && item.streaming === true;
}

function upsertById(items: TimelineItem[], item: MessageItem | NoticeItem): TimelineItem[] {
  const index = items.findIndex((existing) => existing.id === item.id || sameSequence(existing, item));
  if (index === -1) return insertBySequence(items, item);
  return items.map((existing, i) => (i === index ? item : existing));
}

function sameSequence(a: TimelineItem, b: TimelineItem): boolean {
  return (a.sequence ?? 0) > 0 && a.kind === b.kind && a.sequence === b.sequence;
}

/** Inserts an item before the first item created by a later event. */
function insertBySequence(items: TimelineItem[], item: TimelineItem): TimelineItem[] {
  const sequence = item.sequence ?? 0;
  const index = sequence > 0 ? items.findIndex((existing) => (existing.sequence ?? 0) > sequence) : -1;
  if (index === -1) return [...items, item];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * A call's lifecycle only moves forward. Events can arrive out of order or
 * more than once — a bare tool with alwaysSetResult emits toolResult before
 * toolCalled, and history replay re-delivers frames — so folding is ranked:
 * a lower-ranked status never overwrites a higher one, while the event's
 * tool reference, arguments, and content still enrich the item. done and
 * failed share a rank, so between them the latest event wins. denied ranks
 * above both: the runtime records the visitor's refusal as a toolResult
 * too (toolDenied, then toolResult for the same call), and that result
 * must not relabel the call as finished.
 */
const STATUS_RANK: Record<ToolStatus, number> = {
  approvalRequested: 0,
  approved: 1,
  running: 2,
  done: 3,
  failed: 3,
  denied: 4,
};

function upsertTool(
  items: TimelineItem[],
  eventId: string,
  createdAt: string,
  sequence: number | undefined,
  toolCallId: string,
  update: { status: ToolStatus; tool?: WidgetToolReference; content?: unknown; args?: unknown },
): TimelineItem[] {
  const index = items.findIndex((item) => item.kind === "tool" && item.toolCallId === toolCallId);
  if (index === -1) {
    return insertBySequence(items, { kind: "tool", id: eventId, toolCallId, createdAt, sequence, ...update });
  }
  return items.map((item, i) => {
    if (i !== index || item.kind !== "tool") return item;
    const regresses = STATUS_RANK[update.status] < STATUS_RANK[item.status];
    return {
      ...item,
      id: eventId,
      status: regresses ? item.status : update.status,
      tool: update.tool ?? item.tool,
      args: update.args ?? item.args,
      content: update.content ?? item.content,
    };
  });
}

/**
 * Arguments for tools opted into sharing them with widget sessions. Tolerant
 * to the wire field name until the SDK regenerates with the new event shape.
 */
function toolCallArgs(payload: object): unknown {
  const record = payload as Record<string, unknown>;
  return record.arguments ?? record.args;
}

/**
 * The tool calls currently in flight: the contiguous run of tool items after
 * the last message or notice. When the next assistant message (or a terminal
 * notice) folds in, it lands after them and the run empties — so a bottom
 * activity bar naturally clears when the agent's reply arrives.
 */
export function activeTools(items: TimelineItem[]): ToolItem[] {
  const out: ToolItem[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "tool") break;
    out.unshift(item);
  }
  return out;
}

/**
 * True while the agent still owes the visitor a response: the visitor spoke
 * last, or tools are churning between assistant segments. False once the
 * trailing item is an assistant message, a terminal notice, or a tool call
 * waiting on the visitor's approval.
 */
export function awaitingReply(items: TimelineItem[]): boolean {
  const last = items.at(-1);
  if (!last) return false;
  if (last.kind === "notice") return false;
  if (last.kind === "message") return last.role === "user";
  return last.status !== "approvalRequested" && last.status !== "denied";
}
