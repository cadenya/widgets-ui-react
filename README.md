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
`scaling`. The kit's own CSS references only Radix tokens. On top of that:

```tsx
<ConversationsPanel
  composer="floating" // "bar" (default) | "pill" | "floating"
  bubbleColors={{ user: "linear-gradient(135deg, #0d9488, #115e59)", userText: "white" }}
/>
```

`composer="pill"` fuses the input and send button into one rounded capsule;
`"floating"` lifts the capsule onto a shadowed card over a matte main area,
where assistant bubbles render as elevated cards. `bubbleColors` values are
full CSS backgrounds (gradients work) — equivalent to setting the
`--cdny-bubble-*` variables from CSS. For anything beyond that, the stable
`cdny-` class names (`.cdny-panel`, `.cdny-bubble-user`, `.cdny-composer`,
`.cdny-tool`, …) are the contract for custom CSS; the panel's `className`
prop handles sizing and placement.

## Custom tool renderers

Any tool id can map to a component that replaces the default activity chip
while the call is active — including bare tools the page executes itself:

```tsx
<ConversationsPanel
  toolComponents={{
    "external_id:askClarifyingQuestion": ({ toolCall, status, args, result, submit }) => (
      /* collect input, then: */ <button onClick={() => submit("the answer")}>Send</button>
    ),
  }}
/>
```

Keys are the tool's canonical `tool_…` id or your own external id (bare or as
`external_id:<value>`; external id wins). `submit` posts
`setToolCallContent` — the result reaches the conversation as a `toolResult`
event and unblocks the agent.

`args` carries the call's arguments and `result` the tool's output, each
only when the workspace opted that tool into exposing it to widget sessions
(argument exposure is a tool-set overlay setting; result sharing is
per-tool). Both are `undefined` otherwise — treat them as untyped and
validate before rendering.

### Persistent tool cards

By default a tool's component lives in the activity bar above the composer
and retires when the agent's next message arrives. For content that should
stay — resource cards, charts, anything the visitor will scroll back to —
render tool calls inline:

```tsx
<ConversationsPanel toolPlacement="inline" toolComponents={{ display_resource: ResourceCard }} />
```

Every tool call then renders in the thread at its position (registered
component or the default chip), persists after the reply, and is restored
with its `args` and `result` when the conversation is reopened. Nothing
re-executes on reload — page tools only fire for calls still running, and
bare tools that already have a result fold to `done`.

## Widgets Tools template

Cadenya's **Widgets Tools** tool set template (Tool Sets, Create, Use a
template) creates three Bare tools the page answers itself. Everything the
page needs for them is one element, from a separate entry point so apps that
don't use the template don't bundle it:

```tsx
import { ConversationsPanel, PageToolsProvider } from "@cadenya/widgets-ui-react";
import { WidgetTools } from "@cadenya/widgets-ui-react/widget-tools";

<PageToolsProvider>
  <WidgetTools pageContext={{ page: "invoice", invoiceId: invoice.id }} />
  <ConversationsPanel toolPlacement="inline" />
</PageToolsProvider>;
```

| Tool | Handled by | What it does |
| --- | --- | --- |
| `cdy_widget_ask_user` | `AskUser` component | Asks one to four questions, each answered with `radio_buttons`, `checkboxes` (optionally with an "Other" answer) or a `plain_text_input`, and sends `{"answers": {"<id>": answer}}`. The agent waits for it. |
| `cdy_widget_display_details` | `DisplayDetails` component | Shows a card: linked title, subtitle, markdown description, image, label and value fields, link buttons. The template answers the agent immediately, so nothing is submitted. |
| `cdy_widget_get_page_context` | the `pageContext` prop | Returns the prop's current value. Without it, the tool answers that the page shares nothing, so the agent never waits on it. |

Keep `<WidgetTools>` rendered wherever the agent runs with this tool set:
without it, `cdy_widget_ask_user` and `cdy_widget_get_page_context` calls
wait for an answer that never comes. To restyle a tool, pass your own
component: `<WidgetTools components={{ askUser: MyAskUser }} />`.

The components read the call's exposed `args`, which the template's widget
argument exposure overlay turns on. Model-supplied URLs render only when
they are absolute `http(s)` URLs. `AskUser`, `DisplayDetails` and
`WIDGET_TOOL_IDS` are exported too, for custom layouts.

### Registering your own tools the same way

`<WidgetTools>` is built on two hooks you can use for your own tools, under
the same `<PageToolsProvider>`: `usePageTool(key, handler)` answers a call
from the page, and `useToolComponent(key, Component)` renders one. A
`ConversationsPanel` under the provider uses registered components alongside
its `toolComponents` prop; the prop wins for the same tool.

## Messages while the agent responds

By default the visitor can keep typing while the agent works. Messages sent
meanwhile are queued: they show in a compact tray attached to the composer,
one line each, and can be removed until the agent picks them up before its
next reply. To make the visitor wait for the reply instead:

```tsx
<ConversationsPanel queueWhileResponding={false} />
```

In a custom layout, `useConversation` exposes the queue: `send(message,
{ enqueue: true })` queues when the agent is responding, `queuedMessages`
lists what is waiting, and `removeQueuedMessage(id)` takes one back. Render
them with `<QueuedMessages>` directly above a `<Composer attachedTop>`.

## Custom layouts

`ConversationsPanel` is the batteries-included surface. For your own layout,
compose the exported pieces: `ConversationList`, `MessageThread`, `Composer`,
`QueuedMessages`, `ToolActivity`, the hooks (`useConversations`, `useConversation`,
`useWidgetConfig`), the event→timeline projection (`applyEvents`,
`activeTools`, `awaitingReply`), and `createAuthFetch`. `MessageThread`
takes a `renderTool={(item) => …}` callback to draw tool items inline from
their folded state (`status`, `tool`, `args`, `content`).

## Develop

```sh
just install
just test        # vitest
just build       # tsc → dist/
just dev         # tsc --watch, for file:-linked consumers
```

### Storybook

```sh
just storybook   # http://localhost:6006
```

Every component has stories under `src/components/*.stories.tsx`, and the
full `ConversationsPanel` runs against an in-memory mock backend
(`src/__stories__/mock-client.ts`) with a scripted agent — streaming replies,
tool runs, approval requests, page tools, custom tool renderers, and error
notices are all interactive without credentials. The toolbar exposes the
Radix Theme knobs (appearance, accent, gray, radius, scaling), so a design
change can be reviewed across themes in one place. `just storybook-typecheck`
type-checks the stories; `just storybook-build` emits a static site into
`storybook-static/`.

The mock is injected through `WidgetClientProvider`, the exported escape
hatch for supplying a preconstructed (or fake) client instead of
`host`/`token` — handy for your own tests too.

## Conversation lifecycle and worker activity

`useConversation(id)` fetches the single-conversation snapshot with
`client.conversations.retrieve(id)` (`GET /v1/conversations/{id}`) alongside
history. It exposes `conversationState` (`STATE_RESPONDING`, `STATE_OPEN`, or
`STATE_CLOSED`) and, after a `stateChanged` event, the precise `objectiveState`.
Durable state transitions control the panel's responding indicator; a heartbeat
never changes lifecycle state or adds a timeline item.

`isWorkerActive` and `lastHeartbeatAt` report recent work, including work in
nested sub-agents propagated to this conversation. Liveness expires after 10
seconds without a fresh pulse. Expiry means no recent pulse was observed; it
does not mean the objective failed or finished. Waiting conversations can have
active sub-agents or compaction without becoming responding conversations.

Heartbeat payloads have `hb_` IDs and no SSE `id:` field. Reconnects use only
persisted `objevt_` IDs. This branch pins the generated widgets SDK to an exact
commit in `cadenya/widgets-sdk-staging`; Git installations build the React
package through its `prepare` script.
