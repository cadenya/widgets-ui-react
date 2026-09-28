"use client";

import { useId, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CheckboxGroup,
  Flex,
  RadioGroup,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import type { ToolRenderProps } from "../tool-registry.js";
import { parseAskUserArgs, type AskUserQuestion } from "./args.js";

/** Option value standing in for the free-text "Other" answer. */
const OTHER = "\u0000other";

type Draft = { selected: string[]; text: string; other: string };

function initialDraft(question: AskUserQuestion): Draft {
  const element = question.element;
  return element.type === "plain_text_input"
    ? { selected: [], text: element.initialValue ?? "", other: "" }
    : { selected: element.initialOptions, text: "", other: "" };
}

/**
 * One question's answer: the chosen value (radio_buttons), the chosen values
 * (checkboxes), or the text (plain_text_input). "Other" contributes its typed
 * text. Undefined while unanswered.
 */
function answerFor(question: AskUserQuestion, draft: Draft): string | string[] | undefined {
  const element = question.element;
  if (element.type === "plain_text_input") {
    const text = draft.text.trim();
    return text || undefined;
  }
  const other = draft.other.trim();
  const values = draft.selected.flatMap((value) =>
    value === OTHER ? (other ? [other] : []) : [value],
  );
  if (element.type === "radio_buttons") return values[0];
  return values.length > 0 ? values : undefined;
}

/**
 * Renders the Widgets Tools template's `cdy_widget_ask_user` call: one to four questions,
 * each answered with radio buttons, checkboxes or a text field, sent together
 * as `{"answers": {"<question id>": <answer>}}`. The agent waits for it.
 *
 * Needs the tool set's widget argument exposure overlay (the template turns it
 * on); without arguments there is nothing to ask, and it says so.
 */
export function AskUser({ toolCall, status, args, submit }: ToolRenderProps) {
  const questions = parseAskUserArgs(args);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries((questions ?? []).map((q) => [q.id, initialDraft(q)])),
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!questions) {
    return (
      <Card size="1" className="cdny-ask-user">
        <Text size="2" color="gray">
          This question can't be shown. Turn on widget argument exposure for the tool set.
        </Text>
      </Card>
    );
  }

  const answers: Record<string, string | string[]> = {};
  for (const question of questions) {
    const answer = answerFor(question, drafts[question.id] ?? initialDraft(question));
    if (answer !== undefined) answers[question.id] = answer;
  }
  const complete = questions.every((question) => answers[question.id] !== undefined);
  const locked = sent || sending || status !== "running";

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { selected: [], text: "", other: "" }), ...patch },
    }));

  const send = async () => {
    if (!complete || locked) return;
    setSending(true);
    setError(null);
    try {
      await submit(JSON.stringify({ answers }));
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your answer wasn't sent. Try again.");
    } finally {
      setSending(false);
    }
  };

  const stateLabel = sent
    ? "Sent"
    : status === "approvalRequested" || status === "approved"
      ? "Waiting for approval"
      : status === "done"
        ? "Answered"
        : status === "denied" || status === "failed"
          ? "Closed"
          : null;

  return (
    <Card size="2" className="cdny-ask-user" data-tool-call-id={toolCall.toolCallId}>
      <Flex direction="column" gap="4">
        {questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            draft={drafts[question.id] ?? initialDraft(question)}
            disabled={locked}
            onChange={(patch) => update(question.id, patch)}
            onEnter={send}
          />
        ))}
        {error && (
          <Text size="2" color="red" role="alert">
            {error}
          </Text>
        )}
        <Flex align="center" justify="end" gap="3">
          {stateLabel && (
            <Text size="2" color="gray">
              {stateLabel}
            </Text>
          )}
          {!sent && status === "running" && (
            <Button onClick={send} disabled={!complete || locked} loading={sending}>
              {questions.length > 1 ? "Send answers" : "Send answer"}
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

interface QuestionFieldProps {
  question: AskUserQuestion;
  draft: Draft;
  disabled: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onEnter: () => void;
}

function QuestionField({ question, draft, disabled, onChange, onEnter }: QuestionFieldProps) {
  const labelId = useId();
  const element = question.element;
  const otherChosen = draft.selected.includes(OTHER);

  return (
    <Flex direction="column" gap="2" role="group" aria-labelledby={labelId}>
      <Flex direction="column" gap="1">
        {question.header && (
          <Badge size="1" variant="soft" style={{ alignSelf: "flex-start" }}>
            {question.header}
          </Badge>
        )}
        <Text id={labelId} as="p" size="3" weight="medium">
          {question.question}
        </Text>
        {question.context && (
          <Text as="p" size="2" color="gray">
            {question.context}
          </Text>
        )}
      </Flex>

      {element.type === "plain_text_input" ? (
        element.multiline ? (
          <TextArea
            aria-labelledby={labelId}
            value={draft.text}
            placeholder={element.placeholder}
            maxLength={element.maxLength}
            disabled={disabled}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        ) : (
          <TextField.Root
            aria-labelledby={labelId}
            value={draft.text}
            placeholder={element.placeholder}
            maxLength={element.maxLength}
            disabled={disabled}
            onChange={(event) => onChange({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onEnter();
            }}
          />
        )
      ) : (
        <>
          {element.type === "radio_buttons" ? (
            <RadioGroup.Root
              aria-labelledby={labelId}
              value={draft.selected[0] ?? ""}
              disabled={disabled}
              onValueChange={(value) => onChange({ selected: [value] })}
            >
              {element.options.map((option) => (
                <RadioGroup.Item key={option.value} value={option.value}>
                  <OptionLabel text={option.text} description={option.description} />
                </RadioGroup.Item>
              ))}
              {element.allowOther && <RadioGroup.Item value={OTHER}>Other</RadioGroup.Item>}
            </RadioGroup.Root>
          ) : (
            <CheckboxGroup.Root
              aria-labelledby={labelId}
              value={draft.selected}
              disabled={disabled}
              onValueChange={(values) => onChange({ selected: values })}
            >
              {element.options.map((option) => (
                <CheckboxGroup.Item key={option.value} value={option.value}>
                  <OptionLabel text={option.text} description={option.description} />
                </CheckboxGroup.Item>
              ))}
              {element.allowOther && <CheckboxGroup.Item value={OTHER}>Other</CheckboxGroup.Item>}
            </CheckboxGroup.Root>
          )}
          {otherChosen && (
            <TextField.Root
              aria-label={`Other answer to: ${question.question}`}
              placeholder="Your answer"
              value={draft.other}
              disabled={disabled}
              autoFocus
              onChange={(event) => onChange({ other: event.target.value })}
            />
          )}
        </>
      )}
    </Flex>
  );
}

function OptionLabel({ text, description }: { text: string; description?: string }) {
  return (
    <Flex direction="column">
      <Text size="2">{text}</Text>
      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  );
}
