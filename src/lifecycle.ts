import type { WidgetConversation, WidgetEvent, WidgetObjectiveStateChangedEvent } from "@cadenya/widgets";

export type ObjectiveState = WidgetObjectiveStateChangedEvent["toState"];
export const HEARTBEAT_FRESHNESS_MS = 45_000;
export interface Lifecycle {
  conversationState: WidgetConversation["state"] | null;
  objectiveState: ObjectiveState | null;
  stateEventId: string | null;
  lastHeartbeatAt: number | null;
}
export const emptyLifecycle: Lifecycle = {
  conversationState: null, objectiveState: null, stateEventId: null, lastHeartbeatAt: null,
};

function conversationState(state: ObjectiveState): WidgetConversation["state"] {
  switch (state) {
    case "WIDGET_OBJECTIVE_STATE_PENDING":
    case "WIDGET_OBJECTIVE_STATE_RUNNING": return "STATE_RESPONDING";
    case "WIDGET_OBJECTIVE_STATE_WAITING": return "STATE_OPEN";
    case "WIDGET_OBJECTIVE_STATE_FAILED":
    case "WIDGET_OBJECTIVE_STATE_CANCELLED":
    case "WIDGET_OBJECTIVE_STATE_FINALIZED":
    case "WIDGET_OBJECTIVE_STATE_TIMED_OUT": return "STATE_CLOSED";
    default: return "STATE_UNSPECIFIED";
  }
}

/** Activity observations never infer a lifecycle transition, including child pulses. */
export function applyLifecycle(state: Lifecycle, event: WidgetEvent, live: boolean, now = Date.now()): Lifecycle {
  if (event.type === "heartbeat") {
    if (!live) return state;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at) || Math.abs(now - at) > HEARTBEAT_FRESHNESS_MS || at <= (state.lastHeartbeatAt ?? 0)) return state;
    return { ...state, lastHeartbeatAt: Math.min(at, now) };
  }
  if (event.type !== "stateChanged" || !event.id.startsWith("objevt_") ||
    (state.stateEventId !== null && event.id <= state.stateEventId)) return state;
  const objectiveState = event.stateChanged.toState;
  const next = conversationState(objectiveState);
  return {
    ...state, objectiveState, conversationState: next, stateEventId: event.id,
    lastHeartbeatAt: next === "STATE_CLOSED" ? null : state.lastHeartbeatAt,
  };
}
