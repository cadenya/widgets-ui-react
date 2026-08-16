"use client";

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

export interface ToolActivityProps {
  item: ToolItem;
  onApprove?: (toolCallId: string) => void;
  onDeny?: (toolCallId: string) => void;
}

/** One tool call's lifecycle as a status chip, with approve/deny when asked. */
export function ToolActivity({ item, onApprove, onDeny }: ToolActivityProps) {
  const name = item.tool?.name ?? "a tool";
  return (
    <Badge
      className={`cdny-tool cdny-tool-${item.status}`}
      color={item.status === "failed" ? "red" : "gray"}
      variant="surface"
      radius="full"
      size="2"
    >
      <Flex align="center" gap="2">
        {item.status === "running" && <Spinner size="1" />}
        <Text size="1">
          <Strong>{name}</Strong> {TOOL_STATUS_LABEL[item.status]}
        </Text>
        {item.status === "approvalRequested" && (
          <Flex className="cdny-tool-actions" gap="1">
            <Button size="1" variant="soft" onClick={() => onApprove?.(item.toolCallId)}>
              Approve
            </Button>
            <Button size="1" variant="soft" color="red" onClick={() => onDeny?.(item.toolCallId)}>
              Deny
            </Button>
          </Flex>
        )}
      </Flex>
    </Badge>
  );
}
