"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { IconButton } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";

export type ComposerVariant = "bar" | "pill" | "floating";

export interface ComposerProps {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * bar (default): full-width footer with a bordered input.
   * pill: input and send button share one rounded capsule.
   * floating: the capsule floats on a shadowed card over a matte main area.
   */
  variant?: ComposerVariant;
}

/** Message input: Enter sends, Shift+Enter inserts a newline. */
export function Composer({ onSend, disabled, placeholder, variant = "bar" }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const busy = disabled || pending;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || disabled || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await onSend(message);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <>
      <form className={`cdny-composer cdny-composer-${variant}`} onSubmit={submit}>
        <textarea
          ref={inputRef}
          className="cdny-composer-input"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Send a message…"}
          disabled={busy}
          aria-label="Message"
        />
        <IconButton
          className="cdny-composer-send"
          type="submit"
          size="2"
          radius={variant === "bar" ? undefined : "full"}
          disabled={busy || !draft.trim()}
          aria-label="Send"
        >
          <PaperPlaneIcon />
        </IconButton>
      </form>
      {error && (
        <div className="cdny-composer-error" role="alert">
          Couldn't send that: {error}. Try again.
        </div>
      )}
    </>
  );
}
