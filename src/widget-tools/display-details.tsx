"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Button, Card, Flex, Grid, Heading, Link, Text } from "@radix-ui/themes";
import type { ToolRenderProps } from "../tool-registry.js";
import { parseDisplayDetailsArgs } from "./args.js";

const ACTION_STYLE = {
  default: { variant: "soft", color: undefined },
  primary: { variant: "solid", color: undefined },
  danger: { variant: "soft", color: "red" },
} as const;

/**
 * Renders the Widgets Tools template's `cdy_widget_display_details` call as a card: a
 * title (linked when a URL is given), subtitle, markdown description, image,
 * label/value fields and up to three link buttons. The template answers the
 * agent on its own (always-set result), so the card never submits.
 *
 * Only http(s) URLs are rendered; anything else from the model is dropped.
 * Render it inline (`toolPlacement="inline"`) so cards stay in the thread.
 */
export function DisplayDetails({ toolCall, args }: ToolRenderProps) {
  const details = parseDisplayDetailsArgs(args);
  if (!details) {
    return (
      <Card size="1" className="cdny-details">
        <Text size="2" color="gray">
          These details can't be shown. Turn on widget argument exposure for the tool set.
        </Text>
      </Card>
    );
  }

  return (
    <Card size="2" className="cdny-details" data-tool-call-id={toolCall.toolCallId}>
      <Flex direction="column" gap="3">
        <Flex gap="4" align="start" justify="between">
          <Flex direction="column" gap="1" minWidth="0">
            <Heading as="h3" size="4">
              {details.url ? (
                <Link href={details.url} target="_blank" rel="noopener noreferrer">
                  {details.title}
                </Link>
              ) : (
                details.title
              )}
            </Heading>
            {details.subtitle && (
              <Text size="2" color="gray">
                {details.subtitle}
              </Text>
            )}
          </Flex>
          {details.image && (
            <img
              className="cdny-details-image"
              src={details.image.url}
              alt={details.image.altText}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
        </Flex>

        {details.description && (
          // react-markdown escapes raw HTML and filters unsafe link protocols.
          <Box className="cdny-details-description">
            <Markdown remarkPlugins={[remarkGfm]}>{details.description}</Markdown>
          </Box>
        )}

        {details.fields.length > 0 && (
          <Grid columns={{ initial: "1", xs: "2" }} gapX="4" gapY="2" asChild>
            <dl className="cdny-details-fields">
              {details.fields.map((field, index) => (
                <Flex key={`${field.label}-${index}`} direction="column" gap="0">
                  <Text as="span" size="1" color="gray" asChild>
                    <dt>{field.label}</dt>
                  </Text>
                  <Text as="span" size="2" asChild>
                    <dd>{field.value}</dd>
                  </Text>
                </Flex>
              ))}
            </dl>
          </Grid>
        )}

        {details.actions.length > 0 && (
          <Flex gap="2" wrap="wrap">
            {details.actions.map((action, index) => (
              <Button
                key={`${action.url}-${index}`}
                size="2"
                variant={ACTION_STYLE[action.style].variant}
                color={ACTION_STYLE[action.style].color}
                asChild
              >
                <a href={action.url} target="_blank" rel="noopener noreferrer">
                  {action.text}
                </a>
              </Button>
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
