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
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const decide = async (decision: Decision) => {
    if (pending) return;
    setPending(decision);
    setError(null);
    try {
      await (decision === "approve" ? onApprove : onDeny)?.(item.toolCallId);
      // Success: stay pending. The toolApproved/toolDenied event moves the
      // call's status on and retires the controls — re-enabling them here
      // would open a window for a second, conflicting decision.
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
    }
  };

  const awaitingDecision = item.status === "approvalRequested";
  const label = awaitingDecision && pending ? PENDING_LABEL[pending] : TOOL_STATUS_LABEL[item.status];
  const busy = item.status === "running" || (awaitingDecision && pending !== null);

  return (
    <Badge
      className={[
        "cdny-tool",
        `cdny-tool-${item.status}`,
        awaitingDecision && pending ? "cdny-tool-pending" : "",
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
        <Text size="1" role={awaitingDecision && pending ? "status" : undefined}>
          <Strong>{name}</Strong> {label}
        </Text>
        {awaitingDecision && (
          <Flex className="cdny-tool-actions" gap="1">
            <Button
              size="1"
              variant="soft"
              disabled={pending !== null}
              aria-busy={pending === "approve" || undefined}
              onClick={() => decide("approve")}
            >
              Approve
            </Button>
            <Button
              size="1"
              variant="soft"
              color="red"
              disabled={pending !== null}
              aria-busy={pending === "deny" || undefined}
              onClick={() => decide("deny")}
            >
              Deny
            </Button>
          </Flex>
        )}
        {awaitingDecision && error && (
          <Text className="cdny-tool-error" size="1" color="red" role="alert">
            Couldn't send that: {error}. Try again.
          </Text>
        )}
      </Flex>
    </Badge>
  );
}
