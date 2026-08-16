import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState, type ReactNode } from "react";
import { Box, Button, Card, Flex, Text, Theme } from "@radix-ui/themes";
import { ConversationsPanel, type ConversationsPanelProps } from "./conversations-panel.js";
import { PageToolsProvider, usePageTool } from "../page-tools.js";
import type { ToolRenderProps } from "../tool-registry.js";
import { Frame, Hint, MockProvider } from "../__stories__/harness.js";
import {
  approvalAgent,
  customToolAgent,
  demoAgent,
  echoAgent,
  errorAgent,
  pageToolAgent,
  toolAgent,
  TOOLS,
} from "../__stories__/mock-client.js";
import { FAKER_CONVERSATION } from "../__stories__/fixtures.js";

const meta = {
  title: "Widget/ConversationsPanel",
  component: ConversationsPanel,
  parameters: {
    docs: {
      description: {
        component:
          "The full widget, wired to an in-memory mock backend with a scripted agent. " +
          "Every story is interactive: pick a conversation, send messages, approve tools. " +
          "Use the toolbar to flip appearance, accent, gray, radius, and scaling.",
      },
    },
  },
  args: { composer: "bar" },
  argTypes: {
    composer: { control: "inline-radio", options: ["bar", "pill", "floating"] },
    bubbleColors: { control: "object" },
    toolComponents: { table: { disable: true } },
    className: { table: { disable: true } },
  },
  decorators: [
    (Story, { parameters }) => (
      <Frame {...parameters.frame}>
        <Story />
      </Frame>
    ),
  ],
} satisfies Meta<ConversationsPanelProps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the captured Faker conversation so the thread is populated on load. */
const openFakerConversation: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const item = await canvas.findByRole("button", { name: FAKER_CONVERSATION.title! }, { timeout: 5000 });
  await userEvent.click(item);
  await expect(await canvas.findByText(/freshly generated/, {}, { timeout: 5000 })).toBeVisible();
};

export const Default: Story = {
  render: (args) => (
    <MockProvider agent={demoAgent}>
      <ConversationsPanel {...args} />
      <Hint>
        Try: “look up my order” (tool run) · “cancel it” (approval) · “book a date” (custom tool
        component) · “make it dark” (page tool) · “fail” (error) · anything else (markdown echo).
      </Hint>
    </MockProvider>
  ),
};

export const WithThreadOpen: Story = {
  ...Default,
  play: openFakerConversation,
};

export const Pill: Story = { ...Default, args: { composer: "pill" }, play: openFakerConversation };

export const Floating: Story = {
  ...Default,
  args: { composer: "floating" },
  play: openFakerConversation,
};

export const CustomBubbleColors: Story = {
  ...Default,
  args: {
    composer: "floating",
    bubbleColors: {
      user: "linear-gradient(135deg, #0d9488, #115e59)",
      userText: "white",
      assistant: "var(--amber-a3)",
      assistantText: "var(--amber-12)",
    },
  },
  play: openFakerConversation,
};

export const Empty: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={echoAgent}>
      <ConversationsPanel {...args} />
      <Hint>No prior conversations — the first message creates one.</Hint>
    </MockProvider>
  ),
};

export const Loading: Story = {
  render: (args) => (
    <MockProvider hang>
      <ConversationsPanel {...args} />
    </MockProvider>
  ),
};

export const ListError: Story = {
  render: (args) => (
    <MockProvider listError="401 Unauthorized: widget session expired">
      <ConversationsPanel {...args} />
    </MockProvider>
  ),
};

export const ThreadError: Story = {
  render: (args) => (
    <MockProvider eventsError="Failed to load conversation history">
      <ConversationsPanel {...args} />
      <Hint>Select a conversation to see the thread-level error.</Hint>
    </MockProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: FAKER_CONVERSATION.title! }, { timeout: 5000 }));
  },
};

export const SlowNetwork: Story = {
  render: (args) => (
    <MockProvider latency={2500} thinkTime={2000} agent={echoAgent}>
      <ConversationsPanel {...args} />
      <Hint>2.5s round trips and a slow agent — watch the loading and typing states.</Hint>
    </MockProvider>
  ),
};

/** Sends a message and waits for the agent's opening line. */
async function startConversation(canvasElement: HTMLElement, message: string) {
  const canvas = within(canvasElement);
  const input = await canvas.findByPlaceholderText(/get started/i);
  await userEvent.type(input, message);
  await userEvent.keyboard("{Enter}");
}

export const ToolRun: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={toolAgent}>
      <ConversationsPanel {...args} />
    </MockProvider>
  ),
  play: async ({ canvasElement }) => {
    await startConversation(canvasElement, "Where is order ord_8891?");
    await expect(
      await within(canvasElement).findByText("LookupOrder", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  },
};

export const ToolApproval: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={approvalAgent}>
      <ConversationsPanel {...args} />
      <Hint>The agent asks before running CancelOrder — approve or deny in the activity bar.</Hint>
    </MockProvider>
  ),
  play: async ({ canvasElement }) => {
    await startConversation(canvasElement, "Please cancel my order");
    await expect(
      await within(canvasElement).findByRole("button", { name: "Approve" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  },
};

export const AgentError: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={errorAgent}>
      <ConversationsPanel {...args} />
    </MockProvider>
  ),
  play: async ({ canvasElement }) => {
    await startConversation(canvasElement, "Check my order");
    await expect(
      await within(canvasElement).findByText(/order service is unavailable/, {}, { timeout: 8000 }),
    ).toBeVisible();
  },
};

/** A custom renderer for a bare tool: gathers a date from the visitor and submits it. */
function PickDateTool({ status, result, submit }: ToolRenderProps) {
  const [date, setDate] = useState("");
  if (status === "done") {
    return (
      <Card size="1">
        <Text size="1" color="gray">
          Date picked: <Text weight="bold">{String(result)}</Text>
        </Text>
      </Card>
    );
  }
  return (
    <Card size="1">
      <Flex align="center" gap="2" wrap="wrap">
        <Text size="2">Pick a date for your appointment</Text>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ font: "inherit", padding: "4px 8px", borderRadius: "var(--radius-2)", border: "1px solid var(--gray-a7)" }}
        />
        <Button size="1" disabled={!date} onClick={() => submit(date)}>
          Confirm
        </Button>
      </Flex>
    </Card>
  );
}

export const CustomToolComponent: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={customToolAgent}>
      <ConversationsPanel {...args} toolComponents={{ [TOOLS.pickDate.externalId]: PickDateTool }} />
      <Hint>
        The PickDate tool is registered by external id; its component replaces the activity chip
        and delivers the visitor's choice via <code>submit</code>.
      </Hint>
    </MockProvider>
  ),
  play: async ({ canvasElement }) => {
    await startConversation(canvasElement, "Book me an appointment");
    await expect(
      await within(canvasElement).findByText(/Pick a date/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  },
};

/** The "embedding page": registers a page tool that changes its own theme. */
function ThemedPage({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [accentColor, setAccentColor] = useState<string>("teal");
  usePageTool(TOOLS.setTheme.externalId, ({ args }) => {
    const a = (args ?? {}) as { appearance?: "light" | "dark"; accentColor?: string };
    if (a.appearance) setAppearance(a.appearance);
    if (a.accentColor) setAccentColor(a.accentColor);
    return { appearance: a.appearance ?? appearance, accentColor: a.accentColor ?? accentColor };
  });
  return (
    <Theme appearance={appearance} accentColor={accentColor as never} style={{ height: "100%" }}>
      <Flex
        direction="column"
        p="4"
        height="100%"
        style={{ background: "var(--color-background)", borderRadius: "var(--radius-4)" }}
      >
        <Flex justify="between" align="center" mb="3">
          <Text size="2" weight="bold">
            Host page
          </Text>
          <Text size="1" color="gray">
            appearance={appearance} · accent={accentColor}
          </Text>
        </Flex>
        <Box flexGrow="1" minHeight="0">
          {children}
        </Box>
      </Flex>
    </Theme>
  );
}

export const PageTools: Story = {
  render: (args) => (
    <MockProvider seeded={false} agent={pageToolAgent}>
      <PageToolsProvider>
        <ThemedPage>
          <ConversationsPanel {...args} />
        </ThemedPage>
        <Hint>
          Say “make it dark”, “switch to light”, or “use a purple accent” — the agent calls the
          SetTheme page tool and the host page (this card) restyles itself.
        </Hint>
      </PageToolsProvider>
    </MockProvider>
  ),
};

export const Compact: Story = {
  ...Default,
  parameters: { frame: { width: "34rem", height: "30rem" } },
  play: openFakerConversation,
};

export const Tall: Story = {
  ...Default,
  args: { composer: "floating" },
  parameters: { frame: { width: "72rem", height: "52rem" } },
  play: openFakerConversation,
};
