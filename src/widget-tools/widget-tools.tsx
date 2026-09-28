"use client";

import type { ComponentType } from "react";
import { usePageTool, useToolComponent } from "../page-tools.js";
import type { ToolRenderProps } from "../tool-registry.js";
import { AskUser } from "./ask-user.js";
import { DisplayDetails } from "./display-details.js";
import { WIDGET_TOOL_IDS } from "./ids.js";

/** Returned for get_page_context when the page shares no context. */
const NO_PAGE_CONTEXT = "The page does not share any context.";

export interface WidgetToolsProps {
  /**
   * What the page shares when the agent calls `cdy_widget_get_page_context`:
   * the record on screen, a selection, preferences. A string is sent as is,
   * anything else JSON-encoded. The value from the latest render is used, so
   * pass current state directly. When omitted, the tool still answers, saying
   * the page shares nothing, so the agent never waits on it.
   */
  pageContext?: unknown;
  /** Replace the built-in renderers, e.g. to match your design system. */
  components?: {
    askUser?: ComponentType<ToolRenderProps>;
    displayDetails?: ComponentType<ToolRenderProps>;
  };
}

/**
 * Everything the Cadenya "Widgets Tools" tool set template needs on the page,
 * in one element: renderers for `cdy_widget_ask_user` and
 * `cdy_widget_display_details`, and the page's answer to
 * `cdy_widget_get_page_context`. Render it anywhere under the same
 * `<PageToolsProvider>` as the `<ConversationsPanel>`; it renders nothing
 * itself.
 *
 * ```tsx
 * <PageToolsProvider>
 *   <WidgetTools pageContext={{ page: "invoice", invoiceId: invoice.id }} />
 *   <ConversationsPanel toolPlacement="inline" />
 * </PageToolsProvider>
 * ```
 */
export function WidgetTools({ pageContext, components }: WidgetToolsProps) {
  useToolComponent(WIDGET_TOOL_IDS.askUser, components?.askUser ?? AskUser);
  useToolComponent(WIDGET_TOOL_IDS.displayDetails, components?.displayDetails ?? DisplayDetails);
  usePageTool(WIDGET_TOOL_IDS.getPageContext, () => pageContext ?? NO_PAGE_CONTEXT);
  return null;
}
