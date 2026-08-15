# @cadenya/widgets-ui-react

React UI kit for embedding Cadenya widgets in your app: conversation list,
live-streaming message thread, tool approvals, and custom tool renderers.
Network layer via [`@cadenya/widgets`](https://www.npmjs.com/package/@cadenya/widgets);
styling via [Radix Themes](https://www.radix-ui.com/themes).

## Install

```sh
npm install @cadenya/widgets-ui-react @radix-ui/themes
```

## Usage

Your backend mints a widget session server-to-server (`@cadenya/cadenya` →
`widgetSessions.create`) and hands the browser the short-lived token plus the
authoritative host from `info.host`:

```tsx
import "@radix-ui/themes/styles.css";
import "@cadenya/widgets-ui-react/styles.css";
import { Theme } from "@radix-ui/themes";
import { CadenyaWidgetProvider, ConversationsPanel } from "@cadenya/widgets-ui-react";

<Theme accentColor="teal" grayColor="slate" radius="large">
  <CadenyaWidgetProvider
    host={session.host}      // info.host from the session-create response
    token={session.token}    // spec.token, returned only at mint
    getToken={remint}        // POSTs your backend's session endpoint on 401
  >
    <ConversationsPanel />
  </CadenyaWidgetProvider>
</Theme>;
```

There is no token refresh on the widget surface by design — `getToken`
re-mints at your backend, which re-validates the visitor and returns the
existing active session. The kit retries the failed request once; open
streams and mounted hooks survive the rotation.

## Theming

The surrounding `<Theme>` is the appearance API: `appearance`
(`"inherit" | "light" | "dark"`), `accentColor`, `grayColor`, `radius`,
`scaling`. The kit's own CSS references only Radix tokens. For anything
beyond Theme props, the stable `cdny-` class names (`.cdny-panel`,
`.cdny-bubble-user`, `.cdny-composer`, `.cdny-tool`, …) are the contract for
custom CSS; the panel's `className` prop handles sizing and placement.

## Custom tool renderers

Any tool id can map to a component that replaces the default activity chip
while the call is active — including bare tools the page executes itself:

```tsx
<ConversationsPanel
  toolComponents={{
    "external_id:askClarifyingQuestion": ({ toolCall, status, result, submit }) => (
      /* collect input, then: */ <button onClick={() => submit("the answer")}>Send</button>
    ),
  }}
/>
```

Keys are the tool's canonical `tool_…` id or your own external id (bare or as
`external_id:<value>`; external id wins). `submit` posts
`setToolCallContent` — the result reaches the conversation as a `toolResult`
event and unblocks the agent.

## Custom layouts

`ConversationsPanel` is the batteries-included surface. For your own layout,
compose the exported pieces: `ConversationList`, `MessageThread`, `Composer`,
`ToolActivity`, the hooks (`useConversations`, `useConversation`,
`useWidgetConfig`), the event→timeline projection (`applyEvents`,
`activeTools`, `awaitingReply`), and `createAuthFetch`.

## Develop

```sh
just install
just test        # vitest
just build       # tsc → dist/
just dev         # tsc --watch, for file:-linked consumers
```
