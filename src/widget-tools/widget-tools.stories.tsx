import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Box } from "@radix-ui/themes";
import type { ToolRenderProps } from "../tool-registry.js";
import { AskUser } from "./ask-user.js";
import { DisplayDetails } from "./display-details.js";

const toolCall = (externalId: string) => ({
  toolCallId: `toolcall_${externalId}`,
  tool: { id: `tool_${externalId}`, name: externalId, externalId },
});

const askArgs = {
  questions: [
    {
      id: "plan",
      header: "Plan",
      question: "Which plan should I set up?",
      context: "You can change it later in billing.",
      element: {
        type: "radio_buttons",
        options: [
          { value: "starter", text: "Starter", description: "One seat, community support" },
          { value: "team", text: "Team", description: "Up to 20 seats, shared workspaces" },
          { value: "enterprise", text: "Enterprise", description: "SSO, audit logs, SLA" },
        ],
        allow_other: true,
      },
    },
    {
      id: "integrations",
      header: "Integrations",
      question: "Which tools should it connect to?",
      element: {
        type: "checkboxes",
        options: [
          { value: "slack", text: "Slack" },
          { value: "github", text: "GitHub" },
          { value: "linear", text: "Linear" },
        ],
        initial_options: ["slack"],
      },
    },
    {
      id: "notes",
      question: "Anything I should know?",
      element: { type: "plain_text_input", multiline: true, placeholder: "Optional", max_length: 500 },
    },
  ],
};

const detailsArgs = {
  title: "Acme Corp renewal",
  url: "https://example.com/deals/acme",
  subtitle: "Owned by Dana Whitfield",
  description:
    "Renewal is **due in 14 days**. They asked about:\n\n- adding 5 seats\n- moving to annual billing",
  image: {
    url: "https://placehold.co/160x160/png?text=Acme",
    alt_text: "Acme Corp logo",
  },
  fields: [
    { label: "Amount", value: "$48,000 / year" },
    { label: "Stage", value: "Negotiation" },
    { label: "Seats", value: "40" },
    { label: "Close date", value: "Oct 11, 2026" },
  ],
  actions: [
    { text: "Open deal", url: "https://example.com/deals/acme", style: "primary" },
    { text: "Email Dana", url: "https://example.com/mail" },
  ],
};

function Harness(props: ToolRenderProps & { kind: "ask" | "details" }) {
  const { kind, ...rest } = props;
  return <Box m="6">{kind === "ask" ? <AskUser {...rest} /> : <DisplayDetails {...rest} />}</Box>;
}

const meta = {
  title: "Widget tools",
  component: Harness,
  args: {
    kind: "ask",
    toolCall: toolCall("cdy_widget_ask_user"),
    status: "running",
    args: askArgs,
    submit: fn(async () => {}),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Renderers for the Widgets Tools tool set template, from `@cadenya/widgets-ui-react/widget-tools`. `<WidgetTools>` registers them; they're also exported for custom layouts.",
      },
    },
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** cdy_widget_ask_user with one question of each element type; Send enables once all are answered. */
export const AskUserQuestions: Story = {};

/** A single free-text question. */
export const AskUserTextOnly: Story = {
  args: {
    args: {
      questions: [
        {
          id: "name",
          question: "What should I call the project?",
          element: { type: "plain_text_input", placeholder: "e.g. Q4 launch" },
        },
      ],
    },
  },
};

/** After the call finishes (for example on reload), the questions stay but are read-only. */
export const AskUserAnswered: Story = { args: { status: "done" } };

/** Without the widget argument exposure overlay the component has nothing to render. */
export const AskUserWithoutArguments: Story = { args: { args: undefined } };

/** cdy_widget_display_details with every part filled in. */
export const DetailsCard: Story = {
  args: { kind: "details", toolCall: toolCall("cdy_widget_display_details"), status: "done", args: detailsArgs },
};

/** cdy_widget_display_details with only a title and a couple of fields. */
export const DetailsMinimal: Story = {
  args: {
    kind: "details",
    toolCall: toolCall("cdy_widget_display_details"),
    status: "done",
    args: { title: "Order #4412", fields: [{ label: "Status", value: "Shipped" }] },
  },
};
