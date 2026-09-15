import { describe, expect, it } from "vitest";
import type { WidgetEvent } from "@cadenya/widgets";
import { applyLifecycle, emptyLifecycle, HEARTBEAT_FRESHNESS_MS } from "./lifecycle.js";
import { applyEvent } from "./timeline.js";

const now = Date.parse("2026-09-15T12:00:00Z");
function pulse(at = now): WidgetEvent {
  return { id: "hb_pulse", conversationId: "obj_root", createdAt: new Date(at).toISOString(), type: "heartbeat", heartbeat: {} };
}
const waiting: WidgetEvent = {
  id: "objevt_02", conversationId: "obj_root", createdAt: new Date(now).toISOString(), type: "stateChanged",
  stateChanged: { fromState: "WIDGET_OBJECTIVE_STATE_RUNNING", toState: "WIDGET_OBJECTIVE_STATE_WAITING" },
};
describe("objective lifecycle and liveness", () => {
  it("keeps ancestor activity separate from authoritative waiting state and timeline", () => {
    const state = applyLifecycle(emptyLifecycle, waiting, true, now);
    const next = applyLifecycle(state, pulse(), true, now);
    expect(next.conversationState).toBe("STATE_OPEN");
    expect(next.objectiveState).toBe("WIDGET_OBJECTIVE_STATE_WAITING");
    expect(next.lastHeartbeatAt).toBe(now);
    const timeline: ReturnType<typeof applyEvent> = [];
    expect(applyEvent(timeline, pulse())).toBe(timeline);
    expect(applyEvent(timeline, waiting)).toBe(timeline);
  });
  it("does not revive activity from history, stale, or invalid timestamps", () => {
    expect(applyLifecycle(emptyLifecycle, pulse(), false, now)).toBe(emptyLifecycle);
    expect(applyLifecycle(emptyLifecycle, pulse(now - HEARTBEAT_FRESHNESS_MS - 1), true, now)).toBe(emptyLifecycle);
    expect(applyLifecycle(emptyLifecycle, { ...pulse(), createdAt: "invalid" }, true, now)).toBe(emptyLifecycle);
  });
  it("does not regress state on duplicate or out-of-order delivery", () => {
    const state = applyLifecycle(emptyLifecycle, waiting, false, now);
    const older = { ...waiting, id: "objevt_01", stateChanged: { ...waiting.stateChanged, toState: "WIDGET_OBJECTIVE_STATE_RUNNING" } } as WidgetEvent;
    expect(applyLifecycle(state, older, true, now)).toBe(state);
    expect(applyLifecycle(state, waiting, true, now)).toBe(state);
  });
  it("stops the responding indicator on a durable terminal transition", () => {
    const active = applyLifecycle(emptyLifecycle, pulse(), true, now);
    const terminal = { ...waiting, stateChanged: { ...waiting.stateChanged, toState: "WIDGET_OBJECTIVE_STATE_FAILED" } } as WidgetEvent;
    const state = applyLifecycle(active, terminal, true, now);
    expect(state.conversationState).toBe("STATE_CLOSED");
    expect(state.lastHeartbeatAt).toBeNull();
    expect(applyLifecycle(state, pulse(), true, now).conversationState).toBe("STATE_CLOSED");
  });
});
