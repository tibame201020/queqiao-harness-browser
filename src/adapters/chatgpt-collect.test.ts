import { describe, expect, it } from "vitest";
import { advanceAssistantCollectScan, initialAssistantCollectState } from "./chatgpt.js";

describe("ChatGPT assistant collection", () => {
  it("waits for non-generating assistant text to become stable", () => {
    let state = initialAssistantCollectState();

    state = advanceAssistantCollectScan(state, {
      assistantCount: 1,
      latestText: "partial",
      generating: true,
    });
    expect(state.done).toBe(false);

    state = advanceAssistantCollectScan(state, {
      assistantCount: 1,
      latestText: "final answer",
      generating: false,
    });
    expect(state.done).toBe(false);

    state = advanceAssistantCollectScan(state, {
      assistantCount: 1,
      latestText: "final answer",
      generating: false,
    });
    expect(state.done).toBe(true);
    expect(state.latestText).toBe("final answer");
  });

  it("does not complete without an assistant message", () => {
    const state = advanceAssistantCollectScan(initialAssistantCollectState(), {
      assistantCount: 0,
      latestText: "",
      generating: false,
    });
    expect(state.done).toBe(false);
  });

  it("resets stability when assistant text changes", () => {
    let state = initialAssistantCollectState();
    state = advanceAssistantCollectScan(state, {
      assistantCount: 1,
      latestText: "answer A",
      generating: false,
    });
    state = advanceAssistantCollectScan(state, {
      assistantCount: 1,
      latestText: "answer B",
      generating: false,
    });
    expect(state.done).toBe(false);
    expect(state.stablePasses).toBe(0);
  });
});
