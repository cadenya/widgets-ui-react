import type { Preview } from "@storybook/react-vite";
import { Theme, type ThemeProps } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "../src/styles.css";

const ACCENTS = [
  "gray", "gold", "bronze", "brown", "yellow", "amber", "orange", "tomato", "red", "ruby",
  "crimson", "pink", "plum", "purple", "violet", "iris", "indigo", "blue", "cyan", "teal",
  "jade", "green", "grass", "lime", "mint", "sky",
] as const;
const GRAYS = ["auto", "gray", "mauve", "slate", "sage", "olive", "sand"] as const;
const RADII = ["none", "small", "medium", "large", "full"] as const;
const SCALES = ["90%", "95%", "100%", "105%", "110%"] as const;

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    // The Radix <Theme> paints the page background; keep Storybook's
    // backgrounds addon from fighting it.
    backgrounds: { disable: true },
    controls: { expanded: true },
    a11y: { test: "todo" },
    options: {
      storySort: {
        order: ["Widget", ["ConversationsPanel"], "Components", "Docs"],
      },
    },
  },
  globalTypes: {
    appearance: {
      description: "Radix Theme appearance",
      toolbar: {
        title: "Appearance",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
    accentColor: {
      description: "Radix Theme accentColor",
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        items: ACCENTS.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
    grayColor: {
      description: "Radix Theme grayColor",
      toolbar: {
        title: "Gray",
        icon: "contrast",
        items: GRAYS.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
    radius: {
      description: "Radix Theme radius",
      toolbar: {
        title: "Radius",
        icon: "circle",
        items: RADII.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
    scaling: {
      description: "Radix Theme scaling",
      toolbar: {
        title: "Scale",
        icon: "zoom",
        items: SCALES.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    appearance: "light",
    accentColor: "teal",
    grayColor: "slate",
    radius: "large",
    scaling: "100%",
  },
  decorators: [
    (Story, { globals }) => (
      <Theme
        appearance={globals.appearance as ThemeProps["appearance"]}
        accentColor={globals.accentColor as ThemeProps["accentColor"]}
        grayColor={globals.grayColor as ThemeProps["grayColor"]}
        radius={globals.radius as ThemeProps["radius"]}
        scaling={globals.scaling as ThemeProps["scaling"]}
        style={{ minHeight: "100vh" }}
      >
        <Story />
      </Theme>
    ),
  ],
};

export default preview;
