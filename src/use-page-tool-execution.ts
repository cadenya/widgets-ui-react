"use client";

import { useEffect, useRef, useState } from "react";
import { encodePageToolResult, usePageToolsStore, type PageToolHandler, type PageToolInvocation } from "./page-tools.js";
import { activeTools, type TimelineItem } from "./timeline.js";

type SubmitResult = (toolCallId: string, content: string) => Promise<void>;

async function execute(handler: PageToolHandler, invocation: PageToolInvocation): Promise<string> {
  try {
    return encodePageToolResult(await handler(invocation));
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** Execute each pending call once per mount, only after complete history is available. */
export function usePageToolExecution(
  timeline: TimelineItem[],
  enabled: boolean,
  submit: SubmitResult,
): string | null {
  const store = usePageToolsStore();
  const executed = useRef(new Set<string>());
  const [error, setError] = useState<{ submit: SubmitResult; message: string } | null>(null);

  useEffect(() => {
    if (!store || !enabled) return;
    for (const item of activeTools(timeline)) {
      if (item.status !== "running" || !item.tool || executed.current.has(item.toolCallId)) continue;
      const handler = store.resolve(item.tool);
      if (!handler) continue;
      executed.current.add(item.toolCallId);
      const { toolCallId, tool, args } = item;
      // A delivery failure must not re-execute the handler or be sent as a tool error.
      void execute(handler, { toolCallId, tool, args })
        .then((content) => submit(toolCallId, content))
        .catch((err: unknown) => {
          setError({
            submit,
            message: `Couldn't deliver the page tool result: ${err instanceof Error ? err.message : String(err)}`,
          });
        });
    }
  }, [timeline, enabled, store, submit]);

  return error?.submit === submit ? error.message : null;
}
