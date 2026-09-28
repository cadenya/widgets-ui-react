// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolStatus } from "../timeline.js";
import type { ToolRenderProps } from "../tool-registry.js";
import { AskUser } from "./ask-user.js";

const toolCall = { toolCallId: "tc1", tool: { id: "tool_1", name: "Ask user", externalId: "cdy_widget_ask_user" } };

const args = {
  questions: [
    {
      id: "plan",
      question: "Which plan?",
      header: "Plan",
      element: {
        type: "radio_buttons",
        options: [
          { value: "basic", text: "Basic" },
          { value: "pro", text: "Pro", description: "For teams" },
        ],
        allow_other: true,
      },
    },
    {
      id: "notes",
      question: "Anything else?",
      element: { type: "plain_text_input", placeholder: "Optional details" },
    },
  ],
};

function renderAskUser(
  props: Partial<Omit<ToolRenderProps, "submit">> & {
    status?: ToolStatus;
    submit?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const submit = props.submit ?? vi.fn().mockResolvedValue(undefined);
  render(<AskUser toolCall={toolCall} status="running" args={args} {...props} submit={submit} />);
  return submit;
}

const sendButton = () => screen.getByRole("button", { name: "Send answers" }) as HTMLButtonElement;

describe("AskUser", () => {
  it("renders every question with its element", () => {
    renderAskUser();
    expect(screen.getByText("Which plan?")).toBeTruthy();
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Pro/ })).toBeTruthy();
    expect(screen.getByText("For teams")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Other" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Optional details")).toBeTruthy();
  });

  it("sends every answer as JSON once all questions are answered", async () => {
    const submit = renderAskUser();
    expect(sendButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Pro/ }));
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Optional details"), {
      target: { value: "  Five seats  " },
    });
    fireEvent.click(sendButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(JSON.parse(submit.mock.calls[0][0])).toEqual({
      answers: { plan: "pro", notes: "Five seats" },
    });
    expect(await screen.findByText("Sent")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send answers" })).toBeNull();
  });

  it("answers with the typed text when Other is chosen", async () => {
    const submit = renderAskUser();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Other answer/ }), {
      target: { value: "Enterprise" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional details"), { target: { value: "n/a" } });
    fireEvent.click(sendButton());

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(JSON.parse(submit.mock.calls[0][0]).answers.plan).toBe("Enterprise");
  });

  it("collects checkbox answers as a list", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <AskUser
        toolCall={toolCall}
        status="running"
        submit={submit}
        args={{
          questions: [
            {
              id: "days",
              question: "Which days?",
              element: {
                type: "checkboxes",
                options: [
                  { value: "mon", text: "Monday" },
                  { value: "tue", text: "Tuesday" },
                ],
                initial_options: ["mon"],
              },
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(JSON.parse(submit.mock.calls[0][0])).toEqual({ answers: { days: ["mon", "tue"] } });
  });

  it("shows a failed send and lets the visitor retry", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue(undefined);
    renderAskUser({ submit });
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    fireEvent.change(screen.getByPlaceholderText("Optional details"), { target: { value: "x" } });
    fireEvent.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "network down");
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  });

  it("is read-only once the call is no longer running", () => {
    renderAskUser({ status: "done" });
    expect(screen.getByText("Answered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send answers" })).toBeNull();
    expect((screen.getByPlaceholderText("Optional details") as HTMLInputElement).disabled).toBe(true);
  });

  it("explains when arguments are not exposed", () => {
    renderAskUser({ args: undefined });
    expect(screen.getByText(/Turn on widget argument exposure/)).toBeTruthy();
  });
});
