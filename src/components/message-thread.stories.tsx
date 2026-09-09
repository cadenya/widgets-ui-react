import type { Meta, StoryObj } from "@storybook/react-vite";
import { Flex } from "@radix-ui/themes";
import { MessageThread } from "./message-thread.js";
import type { TimelineItem } from "../timeline.js";
import { FAKER_TIMELINE, MARKDOWN_KITCHEN_SINK } from "../__stories__/fixtures.js";

const meta = {
  title: "Components/MessageThread",
  component: MessageThread,
  parameters: {
    docs: {
      description: {
        component:
          "Renders a timeline (see `applyEvents`) as bubbles and notices. Tool items are not shown inline; " +
          "they live in the panel's activity bar.",
      },
    },
  },
  decorators: [
    (Story) => (
      <Flex
        className="cdny-panel"
        direction="column"
        m="6"
        style={{
          width: "40rem",
          height: "32rem",
          maxWidth: "100%",
          border: "1px solid var(--gray-a6)",
          borderRadius: "var(--radius-4)",
          background: "var(--color-panel-solid)",
          overflow: "hidden",
        }}
      >
        <Story />
      </Flex>
    ),
  ],
} satisfies Meta<typeof MessageThread>;

export default meta;
type Story = StoryObj<typeof meta>;

let seq = 0;
function msg(role: "user" | "assistant", content: string): TimelineItem {
  seq += 1;
  return { kind: "message", id: `msg_${seq}`, role, content, createdAt: new Date().toISOString() };
}
function notice(kind: "error" | "cancelled" | "timedOut", message?: string): TimelineItem {
  seq += 1;
  return { kind: "notice", id: `ntc_${seq}`, notice: kind, message, createdAt: new Date().toISOString() };
}

export const FakerConversation: Story = {
  args: { timeline: FAKER_TIMELINE },
};

export const ShortExchange: Story = {
  args: {
    timeline: [
      msg("user", "Hi! Can you help me track an order?"),
      msg("assistant", "Of course — what's the order number?"),
      msg("user", "ord_8891"),
      msg("assistant", "Order **ord_8891** shipped yesterday and should arrive in about 2 days."),
    ],
  },
};

export const AwaitingReply: Story = {
  name: "Awaiting reply (typing indicator)",
  args: {
    timeline: [
      msg("user", "Hi! Can you help me track an order?"),
      msg("assistant", "Of course — what's the order number?"),
      msg("user", "ord_8891"),
    ],
  },
};

/** An assistant turn that only called tools arrives as an empty message — no stray bubble. */
export const ToolOnlyTurn: Story = {
  name: "Tool-only turn (no empty bubble)",
  args: {
    timeline: [
      msg("user", "Show me a demo resource card"),
      msg("assistant", ""),
      {
        kind: "tool",
        id: "evt_tool",
        toolCallId: "toolcall_display",
        tool: { id: "tool_display", externalId: "display_resource", name: "DisplayResource" },
        status: "done",
        createdAt: new Date().toISOString(),
      },
      msg("assistant", "Here's the card you asked for."),
    ],
  },
};

export const MarkdownKitchenSink: Story = {
  args: {
    timeline: [msg("user", "Show me everything markdown can do."), msg("assistant", MARKDOWN_KITCHEN_SINK)],
  },
};

export const LongMessages: Story = {
  args: {
    timeline: [
      msg(
        "user",
        "I have a really long question that goes on and on because I want to describe every single detail of my situation " +
          "before you answer, including the fact that the parcel was left with a neighbour who has since gone on holiday " +
          "and I have no idea when they will be back, and also the tracking page says delivered but it clearly is not.\n\n" +
          "Also here is a second paragraph with a line break preserved.",
      ),
      msg(
        "assistant",
        "That's frustrating — thanks for the detail. Here's what I'd suggest:\n\n" +
          "1. **Check the delivery photo** on the tracking page; couriers usually attach one.\n" +
          "2. **Ask the neighbour** (or leave a note) — most parcels turn up within 48 hours.\n" +
          "3. If it hasn't appeared by then, I can **open a claim** with the courier and ship a replacement.\n\n" +
          "Would you like me to go ahead and open the claim now, or wait a couple of days first? " +
          "There's no cost either way, and I'll keep you posted on the outcome.",
      ),
      msg("user", "Averyveryverylongunbrokenstringofcharacterswithoutspacesthatshouldstillwrapinsidethebubbleandnotoverflow_https://example.com/some/deeply/nested/path?with=query&params=true"),
    ],
  },
};

export const Notices: Story = {
  args: {
    timeline: [
      msg("user", "Run the nightly report."),
      msg("assistant", "Starting the report now."),
      notice("error", "The report service returned 503."),
      msg("user", "Try again."),
      notice("timedOut"),
      msg("user", "Never mind."),
      notice("cancelled"),
    ],
  },
};

export const Loading: Story = {
  args: { timeline: [], loading: true },
};

export const Empty: Story = {
  args: { timeline: [] },
};
