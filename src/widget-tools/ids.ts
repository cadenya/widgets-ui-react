/**
 * External ids of the tools the Widgets Tools template creates, which are also
 * the names the agent sees. The `cdy_widget_` prefix keeps them from clashing
 * with a workspace's own tools.
 */
export const WIDGET_TOOL_IDS = {
  askUser: "cdy_widget_ask_user",
  displayDetails: "cdy_widget_display_details",
  getPageContext: "cdy_widget_get_page_context",
} as const;
