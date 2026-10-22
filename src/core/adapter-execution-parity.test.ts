import { describe, expect, it, vi } from "vitest";
import { executeExecutionScript } from "./execution-script-runtime.js";

const providers = ["chatgpt", "claude", "mistral", "grok"] as const;

describe("one published harness_execute entrypoint across built-in chat adapters", () => {
  it.each(providers)("compiles and dispatches %s through the same runtime boundary", async (provider) => {
    const save = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockResolvedValue({
      status: "ok", action: "trigger", result: {
        status: "triggered", conversationId: "fixture-conversation",
        url: "https://example.invalid/c/fixture-conversation",
      },
    });
    const start = vi.fn(), stop = vi.fn();
    const target = provider === "chatgpt"
      ? { project: { mode: "none" }, conversation: { mode: "new" } }
      : { conversation: { mode: "new" } };
    const result = await executeExecutionScript({
      version: "1", execution: { mode: "once" },
      task: { adapter: provider, action: "trigger", target, input: { prompt: "Synthetic read-only contract probe" } },
    }, { save, run, start, stop });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      adapter: provider, name: `script-${provider}-default`,
      browser: expect.objectContaining({ connection: "managed" }),
    }));
    expect(run).toHaveBeenCalledExactlyOnceWith(`script-${provider}-default`, "trigger", {});
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "ok", action: "trigger", result: { status: "triggered", conversationId: "fixture-conversation" },
      mode: "once", executionId: `script-${provider}-default`,
    });
  });
});