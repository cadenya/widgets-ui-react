import { describe, expect, it } from "vitest";
import { parseAskUserArgs, parseDisplayDetailsArgs, safeUrl } from "./args.js";

describe("parseAskUserArgs", () => {
  it("parses each element type", () => {
    const questions = parseAskUserArgs({
      questions: [
        {
          id: "budget",
          question: "What's your budget?",
          header: "Budget",
          element: {
            type: "radio_buttons",
            options: [
              { value: "low", text: "Under $500", description: "Keep it cheap" },
              { value: "high", text: "Over $500" },
            ],
            initial_options: ["high", "low"],
          },
        },
        {
          id: "extras",
          question: "Any extras?",
          element: {
            type: "checkboxes",
            options: [{ value: "wifi", text: "Wi-Fi" }],
            allow_other: true,
            initial_options: ["wifi", "unknown"],
          },
        },
        {
          id: "notes",
          question: "Anything else?",
          element: { type: "plain_text_input", multiline: true, max_length: 200, placeholder: "..." },
        },
      ],
    });

    expect(questions).toHaveLength(3);
    expect(questions?.[0]).toMatchObject({
      header: "Budget",
      element: { type: "radio_buttons", initialOptions: ["high"], allowOther: false },
    });
    expect(questions?.[1]?.element).toMatchObject({ initialOptions: ["wifi"], allowOther: true });
    expect(questions?.[2]?.element).toEqual({
      type: "plain_text_input",
      multiline: true,
      maxLength: 200,
      placeholder: "...",
      initialValue: undefined,
    });
  });

  it("skips malformed and duplicate questions and keeps at most four", () => {
    const valid = (id: string) => ({
      id,
      question: `Question ${id}?`,
      element: { type: "plain_text_input" },
    });
    const questions = parseAskUserArgs({
      questions: [
        valid("a"),
        valid("a"),
        { id: "b", question: "No element?" },
        { id: "c", question: "One option?", element: { type: "radio_buttons", options: [{ value: "x", text: "X" }] } },
        { id: "d", question: "Unknown?", element: { type: "slider" } },
        valid("e"),
        valid("f"),
        valid("g"),
        valid("h"),
      ],
    });
    expect(questions?.map((q) => q.id)).toEqual(["a", "e", "f", "g"]);
  });

  it("returns null when nothing is usable", () => {
    expect(parseAskUserArgs(undefined)).toBeNull();
    expect(parseAskUserArgs({ questions: [] })).toBeNull();
    expect(parseAskUserArgs({ question: "flat?" })).toBeNull();
  });
});

describe("parseDisplayDetailsArgs", () => {
  it("keeps valid parts and drops unsafe or incomplete ones", () => {
    const details = parseDisplayDetailsArgs({
      title: "Acme renewal",
      url: "javascript:alert(1)",
      subtitle: "Owned by Dana",
      description: "**Due** soon",
      image: { url: "https://example.com/a.png", alt_text: "Logo" },
      fields: [{ label: "Amount", value: "$12,000" }, { label: "Empty" }],
      actions: [
        { text: "Open", url: "https://example.com/deal", style: "primary" },
        { text: "Bad", url: "data:text/html,hi" },
        { text: "Plain", url: "http://example.com", style: "loud" },
      ],
    });

    expect(details).toEqual({
      title: "Acme renewal",
      url: undefined,
      subtitle: "Owned by Dana",
      description: "**Due** soon",
      image: { url: "https://example.com/a.png", altText: "Logo" },
      fields: [{ label: "Amount", value: "$12,000" }],
      actions: [
        { text: "Open", url: "https://example.com/deal", style: "primary" },
        { text: "Plain", url: "http://example.com/", style: "default" },
      ],
    });
  });

  it("requires a title", () => {
    expect(parseDisplayDetailsArgs({ subtitle: "x" })).toBeNull();
    expect(parseDisplayDetailsArgs(null)).toBeNull();
  });
});

describe("safeUrl", () => {
  it("allows only absolute http(s) URLs", () => {
    expect(safeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("/relative")).toBeUndefined();
    expect(safeUrl("JavaScript:alert(1)")).toBeUndefined();
    expect(safeUrl(42)).toBeUndefined();
  });
});
