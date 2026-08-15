"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Flex, IconButton, TextArea } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";

export interface ComposerProps {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

/** Message input: Enter sends, Shift+Enter inserts a newline. */
export function Composer({ onSend, disabled, placeholder }: ComposerProps) {
  const [draft, setDraft] = useState("");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || disabled) return;
    setDraft("");
    await onSend(message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Flex
      asChild
      className="cdny-composer"
      gap="2"
      align="end"
      p="3"
      style={{ borderTop: "1px solid var(--gray-a6)" }}
    >
      <form onSubmit={submit}>
        <TextArea
          className="cdny-composer-input"
          style={{ flex: 1 }}
          size="2"
          rows={1}
          resize="none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Send a message…"}
          disabled={disabled}
        />
        <IconButton
          className="cdny-composer-send"
          type="submit"
          size="2"
          disabled={disabled || !draft.trim()}
          aria-label="Send"
        >
          <PaperPlaneIcon />
        </IconButton>
      </form>
    </Flex>
  );
}
