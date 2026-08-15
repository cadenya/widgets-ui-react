import { describe, expect, it } from "vitest";
import { createPageToolsStore, encodePageToolResult } from "./page-tools";

const noop = () => undefined;

describe("createPageToolsStore", () => {
  it("resolves by external id first, in either key form", () => {
    const store = createPageToolsStore();
    const prefixed = () => "prefixed";
    const bare = () => "bare";
    const byUlid = () => "ulid";
    store.register("external_id:setModel", prefixed);
    store.register("setModel", bare);
    store.register("tool_123", byUlid);

    expect(store.resolve({ id: "tool_123", name: "SetModel", externalId: "setModel" })).toBe(
      prefixed,
    );
  });

  it("falls back from bare external id to tool ulid", () => {
    const store = createPageToolsStore();
    const byUlid = () => "ulid";
    store.register("tool_123", byUlid);
    expect(store.resolve({ id: "tool_123", name: "SetModel", externalId: "setModel" })).toBe(byUlid);
    expect(store.resolve({ id: "tool_123", name: "SetModel" })).toBe(byUlid);
    expect(store.resolve(undefined)).toBeUndefined();
  });

  it("unregisters only its own handler", () => {
    const store = createPageToolsStore();
    const first = () => "first";
    const second = () => "second";
    const unregisterFirst = store.register("tool_1", first);
    store.register("tool_1", second); // later registration wins
    unregisterFirst(); // must not remove the newer handler
    expect(store.resolve({ id: "tool_1", name: "T" })).toBe(second);
    store.register("tool_1", noop)(); // register + immediately unregister
    expect(store.resolve({ id: "tool_1", name: "T" })).toBeUndefined();
  });
});

describe("encodePageToolResult", () => {
  it("passes strings through, JSON-encodes values, defaults undefined", () => {
    expect(encodePageToolResult("done")).toBe("done");
    expect(encodePageToolResult({ ok: true, previous: "opus" })).toBe(
      '{"ok":true,"previous":"opus"}',
    );
    expect(encodePageToolResult(undefined)).toBe('{"ok":true}');
    expect(encodePageToolResult(null)).toBe("null");
  });
});
