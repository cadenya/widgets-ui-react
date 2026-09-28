import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { WidgetQueuedMessage } from "@cadenya/widgets";
import { Composer, type ComposerVariant } from "./composer.js";
import { QueuedMessages } from "./queued-messages.js";

function queued(id: string, content: string): WidgetQueuedMessage {
  return { id, conversationId: "obj_story", content, state: "STATE_QUEUED", createdAt: "2026-09-27T00:00:00Z" };
}

const MESSAGES = [
  queued("objqa_1", "Also include the staging workspace"),
  queued(
    "objqa_2",
    "And when you're done, summarize every tool set you touched along with the secrets each one references, so I can double-check them before we ship",
  ),
];

/** The tray attached to a live composer, the way ConversationsPanel lays them out. */
function Stack({ variant, initial }: { variant: ComposerVariant; initial: WidgetQueuedMessage[] }) {
  const [messages, setMessages] = useState(initial);
  return (
    <Flex
      className={`cdny-panel${variant === "floating" ? " cdny-panel-floating" : ""}`}
      direction="column"
      style={{
        border: "1px solid var(--gray-a6)",
        borderRadius: "var(--radius-4)",
        background: "var(--color-panel-solid)",
        overflow: "hidden",
      }}
    >
      <Flex className="cdny-panel-main" direction="column" style={{ minHeight: "10rem", justifyContent: "flex-end" }}>
        <QueuedMessages
          variant={variant}
          messages={messages}
          onRemove={(id) => setMessages((current) => current.filter((message) => message.id !== id))}
        />
        <Composer
          variant={variant}
          attachedTop={messages.length > 0}
          placeholder="Queue a follow-up…"
          onSend={(content) =>
            setMessages((current) => [...current, queued(`objqa_${current.length + 10}`, content)])
          }
        />
      </Flex>
    </Flex>
  );
}

const meta = {
  title: "Components/QueuedMessages",
  component: QueuedMessages,
  args: { messages: MESSAGES, onRemove: fn(), variant: "bar" },
  argTypes: {
    variant: { control: "inline-radio", options: ["bar", "pill", "floating"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Messages sent while the agent is responding, attached to the top of the composer. " +
          "One line each, cut off with an ellipsis; the remove button takes a message back " +
          "before the agent picks it up. Send more from the composer to grow the list.",
      },
    },
  },
  render: (args) => (
    <Box m="6" style={{ width: "36rem", maxWidth: "100%" }}>
      <Stack variant={args.variant ?? "bar"} initial={args.messages} />
    </Box>
  ),
} satisfies Meta<typeof QueuedMessages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {};
export const Pill: Story = { args: { variant: "pill" } };
export const Floating: Story = { args: { variant: "floating" } };

export const AllVariants: Story = {
  render: (args) => (
    <Flex direction="column" gap="5" m="6" style={{ width: "36rem", maxWidth: "100%" }}>
      {(["bar", "pill", "floating"] as const).map((variant) => (
        <Box key={variant}>
          <Text size="1" color="gray" mb="1" as="p">
            {variant}
          </Text>
          <Stack variant={variant} initial={args.messages} />
        </Box>
      ))}
    </Flex>
  ),
};
