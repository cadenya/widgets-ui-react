Reviewed the production hooks, provider/auth layer, timeline projection, tool registries, components, tests, and package/CI configuration on `refactor/widget-state-stability`.

This change concentrates on async lifecycle correctness and separating transport, execution, and rendering responsibilities. Public component props and exports remain compatible; no dependencies were added.

| Priority | Finding addressed | Result |
| --- | --- | --- |
| High | `useConversation` dispatched history after a conversation switch, even when its effect had been cancelled. Stream iteration also lacked a cancellation check before dispatch. | History requests receive the abort signal, and late pages/events are ignored. State is associated with its client and conversation so the previous timeline is hidden during a switch. |
| High | History was published page by page, with loading cleared after page one. A running tool on one page could execute before its completed result arrived on another. | History publishes atomically after all pages arrive. Page-tool execution also requires a loaded, error-free thread. |
| Medium | The conversation effect combined pagination, stream iteration, retry accounting, timers, and React dispatch. Reconnect timers survived cleanup. | `conversation-stream.ts` separates history loading, live streaming, and cancellable backoff. The hook owns state and subscription lifecycle. Existing retry timing and checkpoint behavior are retained. |
| High | Composer cleared drafts before sending, allowed duplicate first-message submissions, and let rejected promises escape event handlers. | Drafts clear only after success. A synchronous lock prevents duplicate submissions; pending controls disable; errors appear accessibly and the draft remains available for retry. IME confirmation does not send. |
| Medium | The panel treated page-tool result-delivery errors as handler errors, attempted a second submission, and could leave that rejection unhandled. | `use-page-tool-execution.ts` separates handler execution/encoding from delivery. Delivery failures surface in the panel without repeating the side effect or sending a fabricated handler error. |
| Medium | Vitest transpiled tests but neither TypeScript configuration checked them. | `typecheck:tests` and CI now type-check tests with bundler resolution. Corrected an existing hook test's overly narrow initial-props type. |

The main ABC-complexity improvement is a smaller responsibility boundary: `useConversation` no longer contains pagination/reconnect loops, and `ConversationsPanel` no longer contains execution bookkeeping and nested async error handling. Transport behavior is independently testable. This is a structural assessment; no standardized ABC score or performance benchmark was run. Composer gains explicit failure handling, so its local complexity increases to make the previously implicit failure states safe.

Validation completed:

- All 72 tests pass (59 before this change). New regressions cover late history after switching, atomic pagination, cancellation of streamed events and timers, checkpoint resume, retry exhaustion, duplicate sends, failed-draft recovery, IME input, and page-tool handler/delivery failures.
- Production, Storybook, and test TypeScript checks pass.
- Package build, publint, Are the Types Wrong's ESM profile, and Node import smoke test pass. Package packing used a temporary npm cache because the sandbox cannot write to the default cache.
- Storybook production build passes, with warnings about the absent MDX pattern, excluded docgen files, and large Storybook chunks. No browser visual inspection or live-backend integration test was performed.

Remaining findings from code inspection, suitable for subsequent changes:

| Priority | Location | Trigger and suggested direction |
| --- | --- | --- |
| High | `src/hooks.ts`, `useConversations` | Overlapping refreshes can complete out of order, and an older list response can replace a newly created conversation. A client change can also allow an old client's request to publish into the current list. Scope list state to the client and use request generations plus an explicit merge policy for creations. |
| Medium | `src/auth-fetch.ts`, `refresh` / `setToken` | A pending refresh can overwrite a newer token supplied by `setToken`. A delayed 401 can also mint again after another request already refreshed. Track the attempted token/version and apply refresh results only when still current. |
| Medium | `src/hooks.ts`, `send`; `src/components/conversations-panel.tsx`, `onSend` | Sending is not scoped to the selected conversation. Switching while a send/create is pending can retain the old busy state, and a completed create can move selection back unexpectedly. Key mutation state and selection updates to the initiating session. |
| Medium | `src/page-tools.tsx`; `src/use-page-tool-execution.ts` | Store registration does not notify consumers, so a handler registered after a pending call may wait for another timeline change. Execution deduplication remains per panel mount, and failed result delivery has no manual retry. Add observable registration and retain encoded results for delivery-only retry; do not replay side effects automatically. |
| Medium | `src/timeline.ts`, `applyEvents` | Each event scans/copies the timeline. Large backfills can approach quadratic work. Profile realistic histories, then consider a batch-local index while retaining immutable output and lifecycle ordering. |

Atomic history loading temporarily retains all raw history events before projection and delays display until the final page; this is the tradeoff for preventing execution from incomplete history. Exactly-once tool execution across reloads or multiple panels still requires a broader ownership/idempotency design.
