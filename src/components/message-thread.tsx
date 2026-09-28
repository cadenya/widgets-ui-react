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
  /** Authoritative lifecycle overrides the legacy message heuristic. */
  responding?: boolean;
  /** Recent worker activity, including work in sub-agents. */
  isWorkerActive?: boolean;
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
/**
 * Marks which edges of the thread have content beyond them, so CSS can draw
 * a soft shadow there (data-overflow-top / data-overflow-bottom on the
 * .cdny-thread-scroll root).
 */
function markScrollEdges(viewport: HTMLElement) {
  const root = viewport.closest<HTMLElement>(".cdny-thread-scroll");
  if (!root) return;
  const below = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  root.toggleAttribute("data-overflow-top", viewport.scrollTop > 1);
  root.toggleAttribute("data-overflow-bottom", below > 1);
}

export function MessageThread({ timeline, loading, responding, isWorkerActive, renderTool }: MessageThreadProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Whether the reader is at the newest message. Scrolling up to read
  // history releases it; scrolling back to the bottom re-engages it.
  const pinnedRef = useRef(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    pinnedRef.current = true;
    markScrollEdges(viewport);
  }, [timeline, loading]);

  // The thread also changes size without a new event: the activity bar
  // appears, the composer grows a line, the container resizes, rendered
  // markdown reflows. Keep the newest message in view through those while the
  // reader is pinned to it.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => {
      pinnedRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
      markScrollEdges(viewport);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => viewport.removeEventListener("scroll", onScroll);
    }
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) viewport.scrollTop = viewport.scrollHeight;
      markScrollEdges(viewport);
    });
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [loading]);

  if (loading) {
    return (
      <Flex className="cdny-thread cdny-thread-empty" flexGrow="1" align="center" justify="center">
        <span style={{ color: "var(--gray-a10)" }}>Loading conversation…</span>
      </Flex>
    );
  }

  return (
    <ScrollArea ref={viewportRef} scrollbars="vertical" className="cdny-thread-scroll">
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
        {(responding ?? awaitingReply(timeline)) && (
          <div className="cdny-bubble cdny-bubble-assistant cdny-typing" role="status" aria-label={isWorkerActive ? "Agent is responding; worker active" : "Agent is responding"}>
            <span />
            <span />
            <span />
          </div>
        )}
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
