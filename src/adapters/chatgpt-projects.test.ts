import { describe, expect, it } from "vitest";
import { advanceConversationScan, advanceProjectScan, chatGptPageFailure, type ConversationScanState, type ProjectScanState } from "./chatgpt-projects.js";

describe("ChatGPT project hydration scan", () => {
  it("does not finish on repeated header-only passes before projects hydrate", () => {
    let state: ProjectScanState = { hydrated: false, lastCount: -1, stablePasses: 0, done: false };
    state = advanceProjectScan(state, 0, 1);
    expect(state.done).toBe(false);
    state = advanceProjectScan(state, 0, 1);
    expect(state.done).toBe(false);
    state = advanceProjectScan(state, 0, 1);
    expect(state.done).toBe(false);
    state = advanceProjectScan(state, 12, 13);
    expect(state.hydrated).toBe(true);
    expect(state.done).toBe(false);
    state = advanceProjectScan(state, 12, 13);
    state = advanceProjectScan(state, 12, 13);
    expect(state.done).toBe(true);
  });
});


describe("ChatGPT runtime diagnostics", () => {
  it("reports an actionable headless challenge instead of a generic main timeout", () => {
    expect(chatGptPageFailure("https://chatgpt.com/projects", "Just a moment...")).toMatch(/headless|headed/i);
    expect(chatGptPageFailure("https://chatgpt.com/projects", "請稍候...")).toMatch(/headless|headed/i);
  });
});


describe("ChatGPT conversation hydration scan", () => {
  it("does not treat repeated zero conversations as hydrated", () => {
    let state: ConversationScanState = { hydrated: false, lastCount: -1, stablePasses: 0, done: false };
    state = advanceConversationScan(state, 0);
    state = advanceConversationScan(state, 0);
    state = advanceConversationScan(state, 0);
    expect(state.done).toBe(false);
    state = advanceConversationScan(state, 7);
    expect(state.hydrated).toBe(true);
    expect(state.done).toBe(false);
    state = advanceConversationScan(state, 7);
    state = advanceConversationScan(state, 7);
    expect(state.done).toBe(true);
  });
});
