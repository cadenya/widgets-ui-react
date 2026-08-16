import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { Box, ScrollArea } from "@radix-ui/themes";
import { ConversationList } from "./conversation-list.js";
import { CONVERSATIONS } from "../__stories__/fixtures.js";

const meta = {
  title: "Components/ConversationList",
  component: ConversationList,
  args: {
    conversations: CONVERSATIONS,
    selectedId: null,
    onSelect: fn(),
    loading: false,
  },
  decorators: [
    (Story) => (
      <Box
        m="6"
        style={{
          width: "15rem",
          height: "24rem",
          border: "1px solid var(--gray-a6)",
          borderRadius: "var(--radius-4)",
          background: "var(--gray-a2)",
          overflow: "hidden",
        }}
      >
        <ScrollArea scrollbars="vertical">
          <Story />
        </ScrollArea>
      </Box>
    ),
  ],
} satisfies Meta<typeof ConversationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selectedId: CONVERSATIONS[1].id } };

export const NewSelected: Story = { args: { selectedId: null } };

export const Loading: Story = { args: { conversations: [], loading: true } };

export const Empty: Story = { args: { conversations: [] } };

export const Interactive: Story = {
  render: (args) => {
    const [selectedId, setSelectedId] = useState<string | null>(args.selectedId);
    return (
      <ConversationList
        {...args}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          args.onSelect(id);
        }}
      />
    );
  },
};

export const ManyConversations: Story = {
  args: {
    conversations: Array.from({ length: 40 }, (_, i) => ({
      id: `obj_many_${i}`,
      state: i % 7 === 0 ? ("STATE_RESPONDING" as const) : ("STATE_OPEN" as const),
      title: i % 5 === 0 ? undefined : `Conversation ${i + 1}: ${"lorem ipsum ".repeat((i % 4) + 1).trim()}`,
      createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
    })),
    selectedId: "obj_many_3",
  },
};
