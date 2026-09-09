"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Flex, ScrollArea } from "@radix-ui/themes";
import type { NoticeItem, TimelineItem, ToolItem } from "../timeline.js";
import { awaitingReply } from "../timeline.js";

export interface MessageThreadProps {
  timeline: TimelineItem[];
  loading?: boolean;
  /**
   * Render a tool call inline, at its position in the conversation. Called
   * for every tool item, on every render, with the item's folded state
   * (status, tool, args, content) — so a completed call from history
   * renders with everything it had, and a live call re-renders as events
   * fold in. Return null to skip an item. Without this, tool items are not
   * shown in the thread at all (the panel's activity bar covers the
   * in-flight run instead).
   */
  renderTool?: (item: ToolItem) => ReactNode;
}

/**
 * Renders the conversation's messages and notices. By default tool activity
 * is not shown inline — the in-flight run lives in the panel's activity bar
 * (activeTools) and retires once the agent's next message arrives. Pass
 * `renderTool` to render tool calls in the flow instead, where they persist
 * after the reply and across reloads.
 *
 * A message with no visible text renders no bubble: an assistant turn that
 * only calls tools still arrives as an assistantMessage event (its content
 * empty), and a streaming reply may start empty. The item stays in the
 * timeline, so once a later event for the same id carries text, the bubble
 * appears.
 */
export function MessageThread({ timeline, loading, renderTool }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline]);

  if (loading) {
    return (
      <Flex className="cdny-thread cdny-thread-empty" flexGrow="1" align="center" justify="center">
        <span style={{ color: "var(--gray-a10)" }}>Loading conversation…</span>
      </Flex>
    );
  }

  return (
    <ScrollArea scrollbars="vertical" className="cdny-thread-scroll" style={{ flexGrow: 1 }}>
      <Flex className="cdny-thread" direction="column" gap="2" p="4">
        {timeline.map((item) => {
          switch (item.kind) {
            case "message":
              if (!item.content.trim()) return null;
              return (
                <div key={item.id} className={`cdny-bubble cdny-bubble-${item.role}`}>
                  {item.role === "assistant" ? (
                    // react-markdown escapes raw HTML rather than rendering
                    // it, so agent output can't inject markup.
                    <Markdown remarkPlugins={[remarkGfm]}>{item.content}</Markdown>
                  ) : (
                    item.content
                  )}
                </div>
              );
            case "tool": {
              const rendered = renderTool?.(item);
              if (rendered == null || rendered === false) return null;
              return (
                <div key={item.toolCallId} className={`cdny-thread-tool cdny-thread-tool-${item.status}`}>
                  {rendered}
                </div>
              );
            }
            case "notice":
              return <Notice key={item.id} item={item} />;
          }
        })}
        {awaitingReply(timeline) && (
          <div className="cdny-bubble cdny-bubble-assistant cdny-typing" aria-label="Agent is responding">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={bottomRef} />
      </Flex>
    </ScrollArea>
  );
}

const NOTICE_LABEL: Record<NoticeItem["notice"], string> = {
  error: "Something went wrong",
  cancelled: "The run was cancelled",
  timedOut: "The run timed out",
};

function Notice({ item }: { item: NoticeItem }) {
  return (
    <Flex justify="center">
      <Badge className="cdny-notice" color="red" variant="soft" radius="full">
        {NOTICE_LABEL[item.notice]}
        {item.message ? `: ${item.message}` : ""}
      </Badge>
    </Flex>
  );
}
