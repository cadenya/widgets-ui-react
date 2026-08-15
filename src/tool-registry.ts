import type { ComponentType } from "react";
import type { WidgetToolCalledEvent, WidgetToolReference } from "@cadenya/widgets";
import type { ToolStatus } from "./timeline";

/**
 * Custom renderers for tool calls, keyed by the tool's canonical `tool_…` id
 * or the customer's own external id — the latter written bare or in the
 * API's `external_id:<value>` form. When the agent invokes a registered
 * tool, the component renders in place of the default activity chip for the
 * call's whole active lifecycle — so embedders can show rich components as
 * tools run and their results arrive.
 *
 * For bare tools (no execution adapter — the embedding page executes them),
 * the component gathers whatever it needs and delivers the result through
 * `submit`; it reaches the conversation as a toolResult event and unblocks
 * the agent.
 */
export type ToolComponentRegistry = Record<string, ComponentType<ToolRenderProps>>;

export interface ToolRenderProps {
  /** The toolCalled event payload: the call id and tool reference. */
  toolCall: WidgetToolCalledEvent;
  /** The call's lifecycle, folded from subsequent events. */
  status: ToolStatus;
  /**
   * toolResult content, present once the call finishes — only for tools the
   * workspace opted into sharing content with widget sessions.
   */
  result?: unknown;
  /**
   * Deliver a bare tool call's result content. Structured results should be
   * JSON-encoded — the value is handed to the agent as the tool's output.
   */
  submit: (content: string) => Promise<void>;
}

/**
 * The tool's external id is tried first when present — as
 * `external_id:<value>` and bare — before falling back to the tool ULID.
 */
export function resolveToolComponent(
  registry: ToolComponentRegistry,
  tool: WidgetToolReference | undefined,
): ComponentType<ToolRenderProps> | undefined {
  if (!tool) return undefined;
  if (tool.externalId) {
    const byExternalId =
      registry[`external_id:${tool.externalId}`] ?? registry[tool.externalId];
    if (byExternalId) return byExternalId;
  }
  return registry[tool.id];
}
