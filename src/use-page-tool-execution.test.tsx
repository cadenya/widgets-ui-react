// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { PageToolsProvider, usePageTool } from "./page-tools.js";
import { usePageToolExecution } from "./use-page-tool-execution.js";
import type { TimelineItem } from "./timeline.js";

const timeline: TimelineItem[] = [{
  kind: "tool", id: "e1", toolCallId: "tc1", createdAt: "2026-09-09",
  status: "running", tool: { id: "tool1", name: "Test" },
}];

function wrapperFor(handler: () => unknown) {
  function Register() {
    usePageTool("tool1", handler);
    return null;
  }
  return ({ children }: { children: ReactNode }) => (
    <StrictMode><PageToolsProvider><Register />{children}</PageToolsProvider></StrictMode>
  );
}

describe("page tool execution", () => {
  it("waits for complete history and executes once across rerenders and Strict Mode effects", async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const submit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ enabled }) => usePageToolExecution(timeline, enabled, submit), {
      wrapper: wrapperFor(handler), initialProps: { enabled: false },
    });
    expect(handler).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith("tc1", '{"ok":true}'));
    rerender({ enabled: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("encodes handler failures as tool results", async () => {
    const handler = vi.fn(() => { throw new Error("Cannot execute"); });
    const submit = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePageToolExecution(timeline, true, submit), { wrapper: wrapperFor(handler) });
    await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith("tc1", '{"error":"Cannot execute"}'));
  });

  it("surfaces delivery failures without resubmitting or re-executing", async () => {
    const handler = vi.fn(() => "result");
    const submit = vi.fn().mockRejectedValue(new Error("Offline"));
    const { result, rerender } = renderHook(() => usePageToolExecution(timeline, true, submit), {
      wrapper: wrapperFor(handler),
    });
    await waitFor(() => expect(result.current).toContain("Offline"));
    rerender();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledExactlyOnceWith("tc1", "result");
  });
});
