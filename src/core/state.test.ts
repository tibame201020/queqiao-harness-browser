import { describe, expect, it } from "vitest";
import { leaseRemainingMs, selectRetentionCandidates } from "./state.js";

describe("leaseRemainingMs", () => {
  it("returns remaining lease time", () => {
    const now = 10_000;
    expect(leaseRemainingMs({ lastTriggerAtMs: 8_000 }, now, 5_000)).toBe(3_000);
    expect(leaseRemainingMs({ lastTriggerAtMs: 1_000 }, now, 5_000)).toBe(0);
  });
});

describe("selectRetentionCandidates", () => {
  it("never selects pinned or protected conversations", () => {
    const items = [
      { id: "new", pinned: false },
      { id: "pin", pinned: true },
      { id: "protected", pinned: false },
      { id: "old", pinned: false },
    ];
    expect(selectRetentionCandidates(items, { maxConversations: 3, protectedIds: new Set(["protected"]) })).toEqual(["old"]);
  });
});
