// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToolActivity } from "./tool-activity.js";
import type { ToolItem, ToolStatus } from "../timeline.js";

function item(status: ToolStatus): ToolItem {
  return {
    kind: "tool",
    id: "evt_1",
    toolCallId: "tc1",
    tool: { id: "tool_1", name: "CancelOrder" },
    status,
    createdAt: "2026-08-14T00:00:00Z",
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const approve = () => screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
const deny = () => screen.getByRole("button", { name: "Deny" }) as HTMLButtonElement;

describe("ToolActivity approval controls", () => {
  it("disables both controls and shows an accessible pending state while approving, without re-enabling on success", async () => {
    const request = deferred();
    const onApprove = vi.fn(() => request.promise);
    const { rerender } = render(<ToolActivity item={item("approvalRequested")} onApprove={onApprove} />);
    expect(screen.getByText(/wants to run/)).toBeTruthy();

    fireEvent.click(approve());
    expect(onApprove).toHaveBeenCalledWith("tc1");
    expect(approve().disabled).toBe(true);
    expect(deny().disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("approving…");
    expect(approve().getAttribute("aria-busy")).toBe("true");

    // Slow success: the request settles but the event hasn't arrived yet.
    await act(async () => {
      request.resolve();
      await request.promise;
    });
    expect(approve().disabled).toBe(true);
    expect(deny().disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("approving…");

    // The toolApproved event moves the call on; the controls retire.
    rerender(<ToolActivity item={item("approved")} onApprove={onApprove} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/approved/)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the denying state for a deny", () => {
    const onDeny = vi.fn(() => new Promise<void>(() => {}));
    render(<ToolActivity item={item("approvalRequested")} onDeny={onDeny} />);
    fireEvent.click(deny());
    expect(onDeny).toHaveBeenCalledWith("tc1");
    expect(screen.getByRole("status").textContent).toContain("denying…");
    expect(deny().getAttribute("aria-busy")).toBe("true");
    expect(approve().disabled).toBe(true);
  });

  it("ignores duplicate and conflicting clicks while a decision is in flight", () => {
    const onApprove = vi.fn(() => new Promise<void>(() => {}));
    const onDeny = vi.fn(() => new Promise<void>(() => {}));
    render(<ToolActivity item={item("approvalRequested")} onApprove={onApprove} onDeny={onDeny} />);
    fireEvent.click(approve());
    fireEvent.click(approve());
    fireEvent.click(deny());
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("surfaces a failure, re-enables the controls, and lets the visitor retry", async () => {
    const first = deferred();
    const onApprove = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    render(<ToolActivity item={item("approvalRequested")} onApprove={onApprove} />);

    fireEvent.click(approve());
    await act(async () => {
      first.reject(new Error("network down"));
      await first.promise.catch(() => {});
    });
    expect(screen.getByRole("alert").textContent).toContain("network down");
    expect(approve().disabled).toBe(false);
    expect(deny().disabled).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(approve());
    expect(onApprove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(approve().disabled).toBe(true);
  });

  it("treats a synchronous handler as submitted and keeps the controls disabled", () => {
    const onDeny = vi.fn();
    render(<ToolActivity item={item("approvalRequested")} onDeny={onDeny} />);
    fireEvent.click(deny());
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(deny().disabled).toBe(true);
  });
});
