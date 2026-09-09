"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Flex, Spinner, Strong, Text } from "@radix-ui/themes";
import type { ToolItem } from "../timeline.js";

const TOOL_STATUS_LABEL: Record<ToolItem["status"], string> = {
  approvalRequested: "wants to run",
  approved: "approved",
  denied: "denied",
  running: "running",
  done: "finished",
  failed: "failed",
};

type Decision = "approve" | "deny";

const PENDING_LABEL: Record<Decision, string> = {
  approve: "approving…",
  deny: "denying…",
};

export interface ToolActivityProps {
  item: ToolItem;
  /**
   * Decision handlers. A returned promise is awaited: both controls disable
   * and the chip reads "approving…"/"denying…" from the click until the
   * call's status moves on through the event stream, so the visitor can't
   * submit twice or contradict themselves while the request is in flight.
   * A rejection surfaces its message on the chip and re-enables the
   * controls for a retry.
   */
  onApprove?: (toolCallId: string) => void | Promise<void>;
  onDeny?: (toolCallId: string) => void | Promise<void>;
}

/** One tool call's lifecycle as a status chip, with approve/deny when asked. */
export function ToolActivity({ item, onApprove, onDeny }: ToolActivityProps) {
  const name = item.tool?.name ?? "a tool";
  // Decision state is keyed by the call it belongs to: an instance that is
  // reused for a different call (custom layouts without per-call keys) must
  // not inherit the previous call's lock or error, and a request that
  // settles after the instance moved on to another call is ignored.
  const [pending, setPending] = useState<{ toolCallId: string; decision: Decision } | null>(null);
  const [error, setError] = useState<{ toolCallId: string; message: string } | null>(null);
  const currentCall = useRef(item.toolCallId);
  useEffect(() => {
    currentCall.current = item.toolCallId;
    return () => {
      currentCall.current = "";
    };
  }, [item.toolCallId]);

  const pendingDecision = pending?.toolCallId === item.toolCallId ? pending.decision : null;
  const activeError = error?.toolCallId === item.toolCallId ? error.message : null;

  const decide = async (decision: Decision) => {
    if (pendingDecision) return;
    const toolCallId = item.toolCallId;
    setPending({ toolCallId, decision });
    setError(null);
    try {
      await (decision === "approve" ? onApprove : onDeny)?.(toolCallId);
      // Success: stay pending. The toolApproved/toolDenied event moves the
      // call's status on and retires the controls — re-enabling them here
      // would open a window for a second, conflicting decision.
    } catch (err) {
      // Unmounted, or showing a different call by now: nothing to report.
      if (currentCall.current !== toolCallId) return;
      setError({ toolCallId, message: err instanceof Error ? err.message : String(err) });
      setPending((current) => (current?.toolCallId === toolCallId ? null : current));
    }
  };

  const awaitingDecision = item.status === "approvalRequested";
  const label = awaitingDecision && pendingDecision ? PENDING_LABEL[pendingDecision] : TOOL_STATUS_LABEL[item.status];
  const busy = item.status === "running" || (awaitingDecision && pendingDecision !== null);

  return (
    <Badge
      className={[
        "cdny-tool",
        `cdny-tool-${item.status}`,
        awaitingDecision && pendingDecision ? "cdny-tool-pending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      color={item.status === "failed" ? "red" : "gray"}
      variant="surface"
      radius="full"
      size="2"
    >
      <Flex align="center" gap="2" wrap="wrap">
        {busy && <Spinner size="1" />}
        <Text size="1" role={awaitingDecision && pendingDecision ? "status" : undefined}>
          <Strong>{name}</Strong> {label}
        </Text>
        {awaitingDecision && (
          <Flex className="cdny-tool-actions" gap="1">
            <Button
              size="1"
              variant="soft"
              disabled={pendingDecision !== null}
              aria-busy={pendingDecision === "approve" || undefined}
              onClick={() => decide("approve")}
            >
              Approve
            </Button>
            <Button
              size="1"
              variant="soft"
              color="red"
              disabled={pendingDecision !== null}
              aria-busy={pendingDecision === "deny" || undefined}
              onClick={() => decide("deny")}
            >
              Deny
            </Button>
          </Flex>
        )}
        {awaitingDecision && activeError && (
          <Text className="cdny-tool-error" size="1" color="red" role="alert">
            Couldn't send that: {activeError}. Try again.
          </Text>
        )}
      </Flex>
    </Badge>
  );
}
