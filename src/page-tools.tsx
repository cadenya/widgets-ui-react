"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { WidgetToolReference } from "@cadenya/widgets";

/**
 * Page tools: bare tool calls the embedding page executes itself, letting the
 * widget drive the page ("change the model to Claude Opus 5" → the agent
 * invokes the tool → the page's handler mutates its own state → the result
 * returns to the conversation and the agent continues).
 *
 * Register handlers with usePageTool anywhere under a <PageToolsProvider>;
 * a mounted ConversationsPanel under the same provider executes them for
 * pending calls and submits their results via setToolCallContent. Pair
 * destructive tools with approval-required so the visitor confirms in the
 * widget before the page mutates, and pin session parameters so calls can
 * only target what the page is showing.
 */

export interface PageToolInvocation {
  toolCallId: string;
  tool: WidgetToolReference;
  /**
   * The call's arguments, for tools opted into sharing arguments with widget
   * sessions. Absent for tools that haven't opted in.
   */
  args?: unknown;
}

/**
 * Executes one call. The return value becomes the tool's result: strings are
 * sent as-is, anything else is JSON-encoded, undefined becomes {"ok":true}.
 * A thrown error is reported to the agent as {"error": message}.
 */
export type PageToolHandler = (invocation: PageToolInvocation) => Promise<unknown> | unknown;

export interface PageToolsStore {
  register(key: string, handler: PageToolHandler): () => void;
  resolve(tool: WidgetToolReference | undefined): PageToolHandler | undefined;
}

const PageToolsContext = createContext<PageToolsStore | null>(null);

export function createPageToolsStore(): PageToolsStore {
  const handlers = new Map<string, PageToolHandler>();
  return {
    register(key, handler) {
      handlers.set(key, handler);
      return () => {
        if (handlers.get(key) === handler) handlers.delete(key);
      };
    },
    resolve(tool) {
      if (!tool) return undefined;
      if (tool.externalId) {
        const byExternalId =
          handlers.get(`external_id:${tool.externalId}`) ?? handlers.get(tool.externalId);
        if (byExternalId) return byExternalId;
      }
      return handlers.get(tool.id);
    },
  };
}

export function PageToolsProvider({ children }: { children: ReactNode }) {
  const store = useMemo(createPageToolsStore, []);
  return <PageToolsContext.Provider value={store}>{children}</PageToolsContext.Provider>;
}

/** The surrounding store, or null when no provider is present. */
export function usePageToolsStore(): PageToolsStore | null {
  return useContext(PageToolsContext);
}

/**
 * Register a page tool handler for a tool id — the canonical `tool_…` id or
 * your external id (bare or as `external_id:<value>`; external id wins on
 * lookup). The latest render's handler runs, so it can close over current
 * page state; unmounting unregisters.
 */
export function usePageTool(key: string, handler: PageToolHandler): void {
  const store = useContext(PageToolsContext);
  if (!store) {
    throw new Error("Cadenya widgets: usePageTool requires a <PageToolsProvider> ancestor.");
  }

  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(
    () => store.register(key, (invocation) => handlerRef.current(invocation)),
    [store, key],
  );
}

/** Encode a handler's return value for setToolCallContent. */
export function encodePageToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return JSON.stringify({ ok: true });
  return JSON.stringify(value);
}
