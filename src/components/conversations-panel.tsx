"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Callout, Flex, Heading, ScrollArea } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { useConversation, useConversations, useWidgetConfig } from "../hooks.js";
import { encodePageToolResult, usePageToolsStore } from "../page-tools.js";
import { activeTools } from "../timeline.js";
import { resolveToolComponent, type ToolComponentRegistry } from "../tool-registry.js";
import { Composer, type ComposerVariant } from "./composer.js";
import { ConversationList } from "./conversation-list.js";
import { MessageThread } from "./message-thread.js";
import { ToolActivity } from "./tool-activity.js";

export interface ConversationsPanelProps {
  /**
   * Custom renderers for tool calls, keyed by the tool's id or external id.
   * A registered component replaces the default activity chip for the call's
   * active lifecycle, receiving the toolCalled payload, its folded status and
   * result, and a submit callback wired to setToolCallContent (bare tools).
   */
  toolComponents?: ToolComponentRegistry;
  /**
   * Composer style: "bar" (default) is a full-width footer; "pill" fuses the
   * input and send button into one rounded capsule; "floating" lifts the
   * capsule onto a shadowed card over a matte main area.
   */
  composer?: ComposerVariant;
  /** Additional class for the panel root (sizing, positioning). */
  className?: string;
}

/**
 * Full conversation widget: sidebar of past conversations, live message
 * thread, and composer. Drop inside a <CadenyaWidgetProvider>, within a
 * Radix Themes <Theme> — appearance, accent color, radius, and typography
 * all come from the surrounding Theme. The individual pieces
 * (ConversationList, MessageThread, Composer) and hooks are exported for
 * custom layouts.
 */
export function ConversationsPanel({
  toolComponents = {},
  composer = "bar",
  className,
}: ConversationsPanelProps = {}) {
  const config = useWidgetConfig();
  const { conversations, loading: listLoading, error: listError, create, refresh } =
    useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    timeline,
    loading: threadLoading,
    error: threadError,
    sending,
    send,
    approveToolCall,
    denyToolCall,
    setToolCallContent,
  } = useConversation(selectedId);

  const onSend = async (message: string) => {
    if (selectedId) {
      await send(message);
      return;
    }
    // First message starts the conversation.
    const conversation = await create(message);
    setSelectedId(conversation.id);
  };

  const error = listError ?? threadError;
  const tools = activeTools(timeline);

  // Page tools: execute pending bare calls whose tool has a registered
  // handler (usePageTool under a shared PageToolsProvider) and submit the
  // result. Only running calls fire — historical calls backfill with their
  // toolResult and fold to done — and each toolCallId executes once per
  // mount; a still-pending call after a reload correctly re-fires.
  const pageTools = usePageToolsStore();
  const executedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!pageTools) return;
    for (const item of activeTools(timeline)) {
      if (item.status !== "running" || !item.tool) continue;
      if (executedRef.current.has(item.toolCallId)) continue;
      const handler = pageTools.resolve(item.tool);
      if (!handler) continue;
      executedRef.current.add(item.toolCallId);
      const { toolCallId, tool, args } = item;
      (async () => {
        try {
          const result = await handler({ toolCallId, tool, args });
          await setToolCallContent(toolCallId, encodePageToolResult(result));
        } catch (err) {
          await setToolCallContent(
            toolCallId,
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      })();
    }
  }, [timeline, pageTools, setToolCallContent]);

  return (
    <Flex
      className={[
        "cdny-panel",
        composer === "floating" ? "cdny-panel-floating" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      height="100%"
      minHeight="28rem"
      overflow="hidden"
      style={{
        border: "1px solid var(--gray-a6)",
        borderRadius: "var(--radius-4)",
        background: "var(--color-panel-solid)",
      }}
    >
      <Flex
        className="cdny-panel-sidebar"
        direction="column"
        width="15rem"
        flexShrink="0"
        style={{ borderRight: "1px solid var(--gray-a6)", background: "var(--gray-a2)" }}
      >
        <Box className="cdny-panel-header" px="4" py="3" style={{ borderBottom: "1px solid var(--gray-a6)" }}>
          <Heading as="h2" size="2">
            {config?.displayName ?? "Conversations"}
          </Heading>
        </Box>
        <ScrollArea scrollbars="vertical">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              if (id === null) refresh();
            }}
            loading={listLoading}
          />
        </ScrollArea>
      </Flex>

      <Flex className="cdny-panel-main" direction="column" flexGrow="1" minWidth="0">
        {error && (
          <Callout.Root color="red" size="1" m="3" mb="0" className="cdny-error">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        {selectedId ? (
          <MessageThread timeline={timeline} loading={threadLoading} />
        ) : (
          <Flex className="cdny-thread cdny-thread-empty" flexGrow="1" align="center" justify="center">
            <Box as="span" style={{ color: "var(--gray-a10)" }}>
              Start a new conversation with {config?.displayName ?? "the agent"}.
            </Box>
          </Flex>
        )}
        {tools.length > 0 && (
          <Flex
            className="cdny-activity"
            wrap="wrap"
            gap="2"
            px="3"
            py="2"
            aria-live="polite"
            aria-label="Tool activity"
            style={{ borderTop: "1px solid var(--gray-a6)", background: "var(--gray-a2)" }}
          >
            {tools.map((item) => {
              const Custom = resolveToolComponent(toolComponents, item.tool);
              if (Custom && item.tool) {
                return (
                  <Box key={item.toolCallId} className="cdny-activity-custom" width="100%">
                    <Custom
                      toolCall={{ toolCallId: item.toolCallId, tool: item.tool }}
                      status={item.status}
                      result={item.content}
                      submit={(content) => setToolCallContent(item.toolCallId, content)}
                    />
                  </Box>
                );
              }
              return (
                <ToolActivity
                  key={item.toolCallId}
                  item={item}
                  onApprove={approveToolCall}
                  onDeny={denyToolCall}
                />
              );
            })}
          </Flex>
        )}
        <Composer
          variant={composer}
          onSend={onSend}
          disabled={sending}
          placeholder={selectedId ? "Send a message…" : "Ask anything to get started…"}
        />
      </Flex>
    </Flex>
  );
}
