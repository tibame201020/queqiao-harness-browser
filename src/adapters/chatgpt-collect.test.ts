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
describe("ChatGPT multi-step tool response collection", () => {
  it("does not treat stable interim commentary as a final response before the quiet window", () => {
    let state = initialAssistantCollectState();
    const interim = { assistantCount: 1, latestText: "I will call the Worker now", generating: false };
    state = advanceAssistantCollectScan(state, interim, 1000, 12000);
    state = advanceAssistantCollectScan(state, interim, 2500, 12000);
    expect(state.done).toBe(false);
    state = advanceAssistantCollectScan(state, interim, 12999, 12000);
    expect(state.done).toBe(false);
    state = advanceAssistantCollectScan(state, interim, 13000, 12000);
    expect(state.done).toBe(true);
  });

  it("restarts stability when an intermediate tool message changes the assistant count", () => {
    let state = initialAssistantCollectState();
    state = advanceAssistantCollectScan(state, {assistantCount:1,latestText:"same",generating:false}, 1000, 12000);
    state = advanceAssistantCollectScan(state, {assistantCount:2,latestText:"same",generating:false}, 13000, 12000);
    expect(state.done).toBe(false);
    state = advanceAssistantCollectScan(state, {assistantCount:2,latestText:"same",generating:false}, 25000, 12000);
    expect(state.done).toBe(true);
  });
});
