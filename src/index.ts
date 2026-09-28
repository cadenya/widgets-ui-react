export { CadenyaWidgetProvider, WidgetClientProvider, useWidgetClient } from "./context.js";
export type { CadenyaWidgetProviderProps, WidgetClientProviderProps } from "./context.js";
export { createAuthFetch, type AuthFetch, type AuthFetchOptions } from "./auth-fetch.js";
export {
  PageToolsProvider,
  usePageTool,
  usePageToolsStore,
  useToolComponent,
  encodePageToolResult,
  type PageToolHandler,
  type PageToolInvocation,
  type PageToolsStore,
} from "./page-tools.js";
export { usePageToolExecution } from "./use-page-tool-execution.js";
export {
  useConversation,
  useConversations,
  useWidgetConfig,
  type SendOptions,
  type UseConversationResult,
  type UseConversationsResult,
} from "./hooks.js";
export {
  activeTools,
  applyEvent,
  applyEvents,
  awaitingReply,
  type MessageItem,
  type NoticeItem,
  type TimelineItem,
  type ToolItem,
  type ToolStatus,
} from "./timeline.js";
export {
  lookupTool,
  resolveToolComponent,
  type ToolComponentRegistry,
  type ToolRenderProps,
} from "./tool-registry.js";
export {
  ConversationsPanel,
  type BubbleColors,
  type ConversationsPanelProps,
  type ToolPlacement,
} from "./components/conversations-panel.js";
export { ConversationList, type ConversationListProps } from "./components/conversation-list.js";
export { MessageThread, type MessageThreadProps } from "./components/message-thread.js";
export { Composer, type ComposerProps, type ComposerVariant } from "./components/composer.js";
export { QueuedMessages, type QueuedMessagesProps } from "./components/queued-messages.js";
export { ToolActivity, type ToolActivityProps } from "./components/tool-activity.js";

export type { ObjectiveState } from "./lifecycle.js";
