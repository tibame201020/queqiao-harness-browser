import { describe, expect, it } from "vitest";
import { conversationIdFromHref, isPinnedAriaLabel, selectCleanupCandidates } from "./chatgpt.js";

describe("chatgpt conversation identity", () => {
  it("extracts IDs from project conversation links", () => {
    expect(conversationIdFromHref("/g/g-p-abc/project/c/123e4567-e89b-12d3-a456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
  it("recognizes localized pinned aria labels", () => {
    expect(isPinnedAriaLabel("已釘選對話：重要")).toBe(true);
    expect(isPinnedAriaLabel("Pinned chat: Important")).toBe(true);
    expect(isPinnedAriaLabel("釘選聊天")).toBe(false);
  });
});

describe("chatgpt cleanup", () => {
  it("selects only unpinned conversations", () => {
    const items = [
      { id: "a", title: "A", pinned: true },
      { id: "b", title: "B", pinned: false },
    ];
    expect(selectCleanupCandidates(items).map((x) => x.id)).toEqual(["b"]);
  });
});
