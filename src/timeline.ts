import type { WidgetEvent, WidgetToolReference } from "@cadenya/widgets";

/**
 * Projection of the widget event log into renderable timeline items.
 *
 * Events arrive oldest-first (from both listEvents and the SSE stream) and
 * fold in order. Message and notice items are upserted by their event id:
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
  createdAt: string;
}

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
  createdAt: string;
}

export interface NoticeItem {
  kind: "notice";
  id: string;
  notice: "error" | "cancelled" | "timedOut";
  message?: string;
  createdAt: string;
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
      });
    case "assistantMessage":
      return upsertById(items, {
        kind: "message",
        id: event.id,
        role: "assistant",
        content: event.assistantMessage.content,
        createdAt: event.createdAt,
      });

    case "toolApprovalRequested":
      return upsertTool(items, event.id, event.createdAt, event.toolApprovalRequested.toolCallId, {
        status: "approvalRequested",
        tool: event.toolApprovalRequested.tool,
      });
    case "toolApproved":
      return upsertTool(items, event.id, event.createdAt, event.toolApproved.toolCallId, {
        status: "approved",
      });
    case "toolDenied":
      return upsertTool(items, event.id, event.createdAt, event.toolDenied.toolCallId, {
        status: "denied",
      });
    case "toolCalled":
      return upsertTool(items, event.id, event.createdAt, event.toolCalled.toolCallId, {
        status: "running",
        tool: event.toolCalled.tool,
        args: toolCallArgs(event.toolCalled),
      });
    case "toolResult":
      return upsertTool(items, event.id, event.createdAt, event.toolResult.toolCallId, {
        status: "done",
        tool: event.toolResult.tool,
        content: event.toolResult.content,
      });
    case "toolError":
      return upsertTool(items, event.id, event.createdAt, event.toolError.toolCallId, {
        status: "failed",
        tool: event.toolError.tool,
      });

    case "error":
      return upsertById(items, {
        kind: "notice",
        id: event.id,
        notice: "error",
        message: event.error.message,
        createdAt: event.createdAt,
      });
    case "cancelled":
      return upsertById(items, {
        kind: "notice",
        id: event.id,
        notice: "cancelled",
        createdAt: event.createdAt,
      });
    case "timedOut":
      return upsertById(items, {
        kind: "notice",
        id: event.id,
        notice: "timedOut",
        createdAt: event.createdAt,
      });

    default:
      // Forward compatibility: unknown event types render nothing.
      return items;
  }
}

function upsertById(items: TimelineItem[], item: MessageItem | NoticeItem): TimelineItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}

/**
 * A call's lifecycle only moves forward. Events can arrive out of order or
 * more than once — a bare tool with alwaysSetResult emits toolResult before
 * toolCalled, and history replay re-delivers frames — so folding is ranked:
 * a lower-ranked status never overwrites a higher one, while the event's
 * tool reference, arguments, and content still enrich the item. Terminal
 * states share a rank, so among them the latest event wins.
 */
const STATUS_RANK: Record<ToolStatus, number> = {
  approvalRequested: 0,
  approved: 1,
  running: 2,
  denied: 3,
  done: 3,
  failed: 3,
};

function upsertTool(
  items: TimelineItem[],
  eventId: string,
  createdAt: string,
  toolCallId: string,
  update: { status: ToolStatus; tool?: WidgetToolReference; content?: unknown; args?: unknown },
): TimelineItem[] {
  const index = items.findIndex((item) => item.kind === "tool" && item.toolCallId === toolCallId);
  if (index === -1) {
    return [...items, { kind: "tool", id: eventId, toolCallId, createdAt, ...update }];
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
