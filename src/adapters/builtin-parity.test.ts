import { describe, expect, it } from "vitest";
import { createBuiltInRegistry } from "./builtins.js";
import { chatgptAdapter } from "./chatgpt-adapter.js";
import { claudeAdapter } from "./claude-adapter.js";
import { mistralAdapter } from "./mistral-adapter.js";
import { grokAdapter } from "./grok-adapter.js";

const chatAdapters = [chatgptAdapter, claudeAdapter, mistralAdapter, grokAdapter] as const;

describe("the original Browser Harness adapter abstraction", () => {
  it.each(chatAdapters)("registers $id using the exact same HarnessAdapter interface", (adapter) => {
    const registry = createBuiltInRegistry();
    expect(registry.get(adapter.id)).toBe(adapter);
    expect(adapter.bootstrapUrl).toMatch(/^https:\/\//);
    expect(typeof adapter.validateConfig).toBe("function");
    expect(typeof adapter.execute).toBe("function");
    expect(registry.validateConfig(adapter.id, {})).toBeDefined();
  });

  it.each(chatAdapters)("dispatches $id via the same registry, without a caller-specific interface", async (adapter) => {
    const registry = createBuiltInRegistry();
    const context = { browser: { page: {} }, config: { adapterConfig: {} } };
    await expect(registry.execute(adapter.id, "unsupported-parity-probe", {}, context)).rejects.toThrow(/Unsupported/);
  });

  it("retains generic and fails closed on unknown provider identities", () => {
    const registry = createBuiltInRegistry();
    expect(registry.get("generic").id).toBe("generic");
    expect(() => registry.get("unexpected-provider")).toThrow(/Unknown adapter/);
  });
});