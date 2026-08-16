import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Box, Flex, Text } from "@radix-ui/themes";
import { Composer } from "./composer.js";

const meta = {
  title: "Components/Composer",
  component: Composer,
  args: {
    onSend: fn(),
    disabled: false,
    placeholder: "Send a message…",
    variant: "bar",
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["bar", "pill", "floating"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Enter sends, Shift+Enter inserts a newline. `onSend` calls show up in the Actions panel.",
      },
    },
  },
  decorators: [
    (Story, { args }) => (
      <Box m="6" style={{ width: "36rem", maxWidth: "100%" }}>
        {/* Match the panel's main-area context so the floating variant reads right. */}
        <Flex
          className={`cdny-panel${args.variant === "floating" ? " cdny-panel-floating" : ""}`}
          direction="column"
          style={{
            border: "1px solid var(--gray-a6)",
            borderRadius: "var(--radius-4)",
            background: "var(--color-panel-solid)",
            overflow: "hidden",
          }}
        >
          <Flex className="cdny-panel-main" direction="column" style={{ minHeight: "10rem", justifyContent: "flex-end" }}>
            <Story />
          </Flex>
        </Flex>
      </Box>
    ),
  ],
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {};
export const Pill: Story = { args: { variant: "pill" } };
export const Floating: Story = { args: { variant: "floating" } };
export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  decorators: [(Story) => <Story />],
  render: (args) => (
    <Flex direction="column" gap="5" m="6" style={{ width: "36rem", maxWidth: "100%" }}>
      {(["bar", "pill", "floating"] as const).map((variant) => (
        <Box key={variant}>
          <Text size="1" color="gray" mb="1" as="p">
            {variant}
          </Text>
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
            <Flex className="cdny-panel-main" direction="column">
              <Composer {...args} variant={variant} />
            </Flex>
          </Flex>
        </Box>
      ))}
    </Flex>
  ),
};
