import { describe, expect, it } from "vitest";
import {
  advanceConversationScan,
  advanceProjectScan,
  chatGptPageFailure,
  isProjectNewChatButtonLabel,
  projectConversationUrl,
  resolveProjectRowIndex,
  type ConversationScanState,
  type ProjectScanState,
} from "./chatgpt-projects.js";

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

describe("ChatGPT modern project sidebar", () => {
  it("recognizes localized new-chat buttons only for the requested project", () => {
    expect(isProjectNewChatButtonLabel("在 Example Ideas 中開始新對話", "Example Ideas")).toBe(true);
    expect(isProjectNewChatButtonLabel("Start new chat in Example Ideas", "Example Ideas")).toBe(true);
    expect(isProjectNewChatButtonLabel("Start a new chat in Example Ideas", "Example Ideas")).toBe(true);
    expect(isProjectNewChatButtonLabel("在 Other Project 中開始新對話", "Example Ideas")).toBe(false);
    expect(isProjectNewChatButtonLabel("Example Ideas 的專案動作", "Example Ideas")).toBe(false);
  });

  it("builds the canonical persisted project conversation URL from stable ids", () => {
    expect(projectConversationUrl("g-p-exampleprojectid", "123e4567-e89b-12d3-a456-426614174000"))
      .toBe("https://chatgpt.com/g/g-p-exampleprojectid/c/123e4567-e89b-12d3-a456-426614174000");
  });

  it("waits through an unhydrated sidebar but rejects ambiguous project names", () => {
    expect(resolveProjectRowIndex([], "Example Ideas")).toBeNull();
    expect(resolveProjectRowIndex(["Other", "Example Ideas"], "Example Ideas")).toBe(1);
    expect(() => resolveProjectRowIndex(["Example Ideas", "Example Ideas"], "Example Ideas"))
      .toThrow(/ambiguous/i);
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
