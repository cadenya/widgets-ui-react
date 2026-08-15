"use client";

import { useState } from "react";
import { Box, Callout, Flex, Heading, ScrollArea } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { useConversation, useConversations, useWidgetConfig } from "../hooks";
import { activeTools } from "../timeline";
import { resolveToolComponent, type ToolComponentRegistry } from "../tool-registry";
import { Composer } from "./composer";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ToolActivity } from "./tool-activity";

export interface ConversationsPanelProps {
  /**
   * Custom renderers for tool calls, keyed by the tool's id or external id.
   * A registered component replaces the default activity chip for the call's
   * active lifecycle, receiving the toolCalled payload, its folded status and
   * result, and a submit callback wired to setToolCallContent (bare tools).
   */
  toolComponents?: ToolComponentRegistry;
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
export function ConversationsPanel({ toolComponents = {}, className }: ConversationsPanelProps = {}) {
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

  return (
    <Flex
      className={className ? `cdny-panel ${className}` : "cdny-panel"}
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
          onSend={onSend}
          disabled={sending}
          placeholder={selectedId ? "Send a message…" : "Ask anything to get started…"}
        />
      </Flex>
    </Flex>
  );
}
