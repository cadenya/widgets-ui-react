// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CadenyaWidgets, WidgetConversation } from "@cadenya/widgets";
import { WidgetClientProvider } from "./context.js";
import { useConversations } from "./hooks.js";
import { PageToolsProvider, useClientTool } from "./page-tools.js";

function fakeClient() {
  const create = vi.fn(async (params: unknown) => ({ id: "conv_1", params }) as unknown as WidgetConversation);
  const client = {
    conversations: {
      list: vi.fn(async () => ({ items: [] })),
      create,
    },
  };
  return { client: client as unknown as CadenyaWidgets, create };
}

function wrapperFor(client: CadenyaWidgets) {
  return ({ children }: { children: ReactNode }) => (
    <WidgetClientProvider client={client}>
      <PageToolsProvider>{children}</PageToolsProvider>
    </WidgetClientProvider>
  );
}

const parameters = { type: "object", properties: { city: { type: "string" } } };

describe("useClientTool with useConversations", () => {
  it("sends registered client tool definitions when a conversation is created", async () => {
    const { client, create } = fakeClient();
    const { result } = renderHook(
      () => {
        useClientTool({ name: "getWeather", description: "Weather for a city", parameters, execute: () => "sunny" });
        return useConversations();
      },
      { wrapper: wrapperFor(client) },
    );

    await act(async () => {
      await result.current.create("hello");
    });

    expect(create).toHaveBeenCalledWith({
      message: "hello",
      clientTools: { definitions: [{ name: "getWeather", description: "Weather for a city", parameters }] },
    });
  });

  it("sends no clientTools field without registered tools", async () => {
    const { client, create } = fakeClient();
    const { result } = renderHook(() => useConversations(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.create("hello");
    });

    expect(create).toHaveBeenCalledWith({ message: "hello" });
  });

  it("prefers explicit clientTools over registered ones", async () => {
    const { client, create } = fakeClient();
    const { result } = renderHook(
      () => {
        useClientTool({ name: "getWeather", execute: () => "sunny" });
        return useConversations();
      },
      { wrapper: wrapperFor(client) },
    );

    await act(async () => {
      await result.current.create("hello", { clientTools: { definitions: [{ name: "getTime" }] } });
    });

    expect(create).toHaveBeenCalledWith({ message: "hello", clientTools: { definitions: [{ name: "getTime" }] } });
  });
});
