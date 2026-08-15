"use client";

import { Box, Flex, Text } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import type { WidgetConversation } from "@cadenya/widgets";

export interface ConversationListProps {
  conversations: WidgetConversation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
}: ConversationListProps) {
  return (
    <Flex asChild className="cdny-list" direction="column" gap="1" p="2">
      <nav aria-label="Conversations">
        <button
          className={`cdny-list-item cdny-list-new${selectedId === null ? " cdny-selected" : ""}`}
          onClick={() => onSelect(null)}
        >
          <PlusIcon aria-hidden />
          New conversation
        </button>
        {loading && (
          <Box p="2">
            <Text size="2" color="gray">
              Loading…
            </Text>
          </Box>
        )}
        {!loading && conversations.length === 0 && (
          <Box p="2">
            <Text size="2" color="gray">
              No conversations yet
            </Text>
          </Box>
        )}
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`cdny-list-item${conversation.id === selectedId ? " cdny-selected" : ""}`}
            onClick={() => onSelect(conversation.id)}
          >
            <span className="cdny-list-title">{conversation.title || "Untitled conversation"}</span>
            {conversation.state === "STATE_RESPONDING" && <span className="cdny-list-dot" />}
          </button>
        ))}
      </nav>
    </Flex>
  );
}
