// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisplayDetails } from "./display-details.js";

const toolCall = {
  toolCallId: "tc1",
  tool: { id: "tool_1", name: "Display details", externalId: "cdy_widget_display_details" },
};

describe("DisplayDetails", () => {
  it("renders the card's parts", () => {
    render(
      <DisplayDetails
        toolCall={toolCall}
        status="done"
        submit={vi.fn()}
        args={{
          title: "Acme renewal",
          url: "https://example.com/deal",
          subtitle: "Owned by Dana",
          description: "Renews **soon**.",
          image: { url: "https://example.com/logo.png", alt_text: "Acme logo" },
          fields: [{ label: "Amount", value: "$12,000" }],
          actions: [{ text: "Open deal", url: "https://example.com/deal/1", style: "primary" }],
        }}
      />,
    );

    const title = screen.getByRole("link", { name: "Acme renewal" });
    expect(title.getAttribute("href")).toBe("https://example.com/deal");
    expect(title.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Owned by Dana")).toBeTruthy();
    expect(screen.getByText("soon").tagName).toBe("STRONG");
    expect(screen.getByRole("img", { name: "Acme logo" })).toBeTruthy();
    expect(screen.getByText("Amount").tagName).toBe("DT");
    expect(screen.getByText("$12,000").tagName).toBe("DD");
    expect(screen.getByRole("link", { name: "Open deal" }).getAttribute("href")).toBe(
      "https://example.com/deal/1",
    );
  });

  it("drops unsafe URLs instead of linking them", () => {
    render(
      <DisplayDetails
        toolCall={toolCall}
        status="done"
        submit={vi.fn()}
        args={{ title: "Plain", url: "javascript:alert(1)", actions: [{ text: "Go", url: "javascript:x" }] }}
      />,
    );
    expect(screen.getByText("Plain")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("explains when arguments are not exposed", () => {
    render(<DisplayDetails toolCall={toolCall} status="done" submit={vi.fn()} />);
    expect(screen.getByText(/Turn on widget argument exposure/)).toBeTruthy();
  });
});
