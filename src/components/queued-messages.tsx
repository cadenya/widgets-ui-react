"use client";

import { useState } from "react";
import { IconButton } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import type { WidgetQueuedMessage } from "@cadenya/widgets";
import type { ComposerVariant } from "./composer.js";

export interface QueuedMessagesProps {
  /** Messages waiting for the agent, oldest first. Renders nothing when empty. */
  messages: WidgetQueuedMessage[];
  /** Remove a queued message before the agent picks it up. */
  onRemove: (queuedMessageId: string) => Promise<void> | void;
  /**
   * The composer variant the tray sits on, so it matches that composer's
   * width and shape. Pass `attachedTop` to the composer while the tray shows.
   */
  variant?: ComposerVariant;
}

/**
 * Compact tray of queued messages, attached to the top of the composer: one
 * line per message, cut off with an ellipsis, each with a remove button.
 */
export function QueuedMessages({ messages, onRemove, variant = "bar" }: QueuedMessagesProps) {
  const [error, setError] = useState<string | null>(null);

  if (messages.length === 0) return null;

  const remove = async (id: string) => {
    setError(null);
    try {
      await onRemove(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={`cdny-queued cdny-queued-${variant}`}>
      <ul className="cdny-queued-list" aria-label="Queued messages">
        {messages.map((message) => (
          <li key={message.id} className="cdny-queued-item">
            <span className="cdny-queued-text" title={message.content}>
              {message.content}
            </span>
            <IconButton
              type="button"
              size="1"
              variant="ghost"
              color="gray"
              className="cdny-queued-remove"
              aria-label={`Remove queued: ${message.content}`}
              onClick={() => void remove(message.id)}
            >
              <Cross2Icon />
            </IconButton>
          </li>
        ))}
      </ul>
      {error && (
        <div className="cdny-queued-error" role="alert">
          Couldn't remove that message: {error}
        </div>
      )}
    </div>
  );
}
