import { useMemo, useState, type ReactNode } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { WidgetClientProvider } from "../context.js";
import { createMockClient, type MockClientOptions } from "./mock-client.js";
import { CONVERSATIONS, CONVERSATION_EVENTS } from "./fixtures.js";

export interface MockProviderProps extends MockClientOptions {
  /** Start with the fixture conversations loaded (default true). */
  seeded?: boolean;
  children: ReactNode;
}

/**
 * Wraps children in a WidgetClientProvider backed by a fresh mock client.
 * The client is created once per mount, so remounting a story resets state.
 */
export function MockProvider({ seeded = true, children, ...options }: MockProviderProps) {
  const { client } = useMemo(
    () =>
      createMockClient({
        conversations: seeded ? CONVERSATIONS : [],
        events: seeded ? CONVERSATION_EVENTS : {},
        ...options,
      }),
    // Options are story args; a change to any of them means a new backend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seeded, JSON.stringify({ ...options, agent: options.agent?.name })],
  );
  return <WidgetClientProvider client={client}>{children}</WidgetClientProvider>;
}

/** A sized frame that mimics an embedding page's slot for the widget. */
export function Frame({
  width = "56rem",
  height = "36rem",
  children,
}: {
  width?: string;
  height?: string;
  children: ReactNode;
}) {
  return (
    <Box p="6" style={{ minHeight: "100vh", background: "var(--color-background)" }}>
      <Box style={{ width, height, maxWidth: "100%" }}>{children}</Box>
    </Box>
  );
}

/** A caption under the frame explaining how to drive the story. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <Flex mt="3" style={{ maxWidth: "56rem" }}>
      <Text size="1" color="gray">
        {children}
      </Text>
    </Flex>
  );
}

/** Small piece of "page" state a page-tool story can mutate. */
export function usePageState() {
  const [state, setState] = useState<{ appearance: "light" | "dark"; accentColor: string }>({
    appearance: "light",
    accentColor: "teal",
  });
  return [state, setState] as const;
}
