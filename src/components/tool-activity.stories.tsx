import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Flex } from "@radix-ui/themes";
import { ToolActivity } from "./tool-activity.js";
import type { ToolItem, ToolStatus } from "../timeline.js";
import { TOOLS } from "../__stories__/mock-client.js";

function item(status: ToolStatus, overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    kind: "tool",
    id: `evt_${status}`,
    toolCallId: `toolcall_${status}`,
    tool: TOOLS.lookupOrder,
    status,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const meta = {
  title: "Components/ToolActivity",
  component: ToolActivity,
  args: {
    item: item("running"),
    onApprove: fn(),
    onDeny: fn(),
  },
  decorators: [
    (Story) => (
      <Flex
        className="cdny-activity"
        wrap="wrap"
        gap="2"
        m="6"
        px="3"
        py="2"
        style={{
          width: "40rem",
          maxWidth: "100%",
          border: "1px solid var(--gray-a6)",
          borderRadius: "var(--radius-3)",
          background: "var(--gray-a2)",
        }}
      >
        <Story />
      </Flex>
    ),
  ],
} satisfies Meta<typeof ToolActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const ApprovalRequested: Story = { args: { item: item("approvalRequested", { tool: TOOLS.cancelOrder }) } };
export const Approved: Story = { args: { item: item("approved", { tool: TOOLS.cancelOrder }) } };
export const Denied: Story = { args: { item: item("denied", { tool: TOOLS.cancelOrder }) } };
export const Done: Story = { args: { item: item("done") } };
export const Failed: Story = { args: { item: item("failed") } };
export const UnknownTool: Story = { args: { item: item("running", { tool: undefined }) } };

const slow = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Decision handlers that take a while — the chip shows the pending state and locks both controls. */
export const SlowDecision: Story = {
  name: "Approval, slow request",
  args: {
    item: item("approvalRequested", { tool: TOOLS.cancelOrder }),
    onApprove: fn(slow(4000)),
    onDeny: fn(slow(4000)),
  },
};

/** The decision request fails: the chip reports it and the controls come back for a retry. */
export const FailedDecision: Story = {
  name: "Approval, request fails",
  args: {
    item: item("approvalRequested", { tool: TOOLS.cancelOrder }),
    onApprove: fn(async () => {
      await slow(800)();
      throw new Error("widget session expired");
    }),
    onDeny: fn(async () => {
      await slow(800)();
      throw new Error("widget session expired");
    }),
  },
};

export const AllStatuses: Story = {
  render: (args) => (
    <>
      {(["approvalRequested", "approved", "denied", "running", "done", "failed"] as const).map((status) => (
        <ToolActivity key={status} {...args} item={item(status)} />
      ))}
    </>
  ),
};

export const ManyRunning: Story = {
  name: "Many running (activity bar wrap)",
  render: (args) => (
    <>
      {["GenerateFake", "ListGenerators", "LookupOrder", "FetchWeather", "SearchDocs", "SendEmail", "CreateTicket"].map(
        (name, i) => (
          <ToolActivity
            key={name}
            {...args}
            item={item(i % 3 === 0 ? "done" : "running", { toolCallId: `tc_${i}`, tool: { id: `tool_${i}`, name } })}
          />
        ),
      )}
    </>
  ),
};
