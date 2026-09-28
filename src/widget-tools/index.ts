/**
 * `@cadenya/widgets-ui-react/widget-tools`: the page side of the Cadenya
 * "Widgets Tools" tool set template. Render `<WidgetTools>` under the same
 * `<PageToolsProvider>` as the panel. Separate from the main entry so apps
 * that don't install the template don't bundle it.
 */
export { WidgetTools, type WidgetToolsProps } from "./widget-tools.js";
export { AskUser } from "./ask-user.js";
export { DisplayDetails } from "./display-details.js";
export { WIDGET_TOOL_IDS } from "./ids.js";
export {
  parseAskUserArgs,
  parseDisplayDetailsArgs,
  safeUrl,
  type AskUserElement,
  type AskUserOption,
  type AskUserQuestion,
  type DetailsAction,
  type DetailsField,
  type DisplayDetailsArgs,
} from "./args.js";
