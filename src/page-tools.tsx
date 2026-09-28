"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import type { WidgetToolReference } from "@cadenya/widgets";
import { lookupTool, type ToolRenderProps } from "./tool-registry.js";

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
 *
 * The provider also holds tool components registered with useToolComponent:
 * renderers a ConversationsPanel under it uses for matching tool calls, in
 * addition to its own toolComponents prop. That lets a single element (such
 * as <WidgetTools>) bring both the renderers and the handlers a set of tools
 * needs.
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
  /** Registers a component that renders calls to the tool with this key. */
  registerComponent(key: string, component: ComponentType<ToolRenderProps>): () => void;
  resolveComponent(tool: WidgetToolReference | undefined): ComponentType<ToolRenderProps> | undefined;
  /** Calls listener whenever registered components change. */
  subscribe(listener: () => void): () => void;
  /** A number that changes whenever registered components change. */
  componentsVersion(): number;
}

const PageToolsContext = createContext<PageToolsStore | null>(null);

export function createPageToolsStore(): PageToolsStore {
  const handlers = new Map<string, PageToolHandler>();
  const components = new Map<string, ComponentType<ToolRenderProps>>();
  const listeners = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  return {
    register(key, handler) {
      handlers.set(key, handler);
      return () => {
        if (handlers.get(key) === handler) handlers.delete(key);
      };
    },
    resolve(tool) {
      return lookupTool((key) => handlers.get(key), tool);
    },
    registerComponent(key, component) {
      components.set(key, component);
      changed();
      return () => {
        if (components.get(key) === component) {
          components.delete(key);
          changed();
        }
      };
    },
    resolveComponent(tool) {
      return lookupTool((key) => components.get(key), tool);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    componentsVersion() {
      return version;
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

/**
 * Register a component that renders calls to a tool — keyed like usePageTool
 * (the canonical `tool_…` id or your external id, bare or as
 * `external_id:<value>`). A ConversationsPanel under the same provider uses
 * it for matching calls; a component passed in the panel's toolComponents
 * prop for the same tool wins. Unmounting unregisters.
 */
export function useToolComponent(key: string, component: ComponentType<ToolRenderProps>): void {
  const store = useContext(PageToolsContext);
  if (!store) {
    throw new Error("Cadenya widgets: useToolComponent requires a <PageToolsProvider> ancestor.");
  }
  useEffect(() => store.registerComponent(key, component), [store, key, component]);
}

/** Encode a handler's return value for setToolCallContent. */
export function encodePageToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return JSON.stringify({ ok: true });
  return JSON.stringify(value);
}
