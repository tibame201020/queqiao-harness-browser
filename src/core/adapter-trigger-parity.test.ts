import { describe, expect, it } from "vitest";
import { ambiguousTriggerBlocked, nextAmbiguousTrigger, triggerMayHaveDispatched } from "./trigger-guard.js";

describe("adapter-independent trigger receipt semantics", () => {
  it("blocks on persisted ambiguity independently of adapter identity", () => {
    for (const provider of ["chatgpt", "claude", "mistral", "grok", "fixture-future-provider"]) {
      expect(ambiguousTriggerBlocked({ ambiguousTrigger: true }, provider, "trigger", false)).toBe(true);
      expect(ambiguousTriggerBlocked({ ambiguousTrigger: true }, provider, "collect", false)).toBe(false);
      expect(ambiguousTriggerBlocked({ ambiguousTrigger: true }, provider, "trigger", true)).toBe(false);
    }
  });
  it("records only observable dispatch evidence, not pre-send unavailability", () => {
    expect(triggerMayHaveDispatched("trigger", { status: "triggered" })).toBe(true);
    expect(triggerMayHaveDispatched("trigger", { status: "ambiguous" })).toBe(true);
    expect(triggerMayHaveDispatched("trigger", { status: "unavailable" })).toBe(false);
    expect(triggerMayHaveDispatched("collect", { status: "completed" })).toBe(false);
    expect(triggerMayHaveDispatched("trigger", null)).toBe(false);
  });
  it("keeps ambiguity across read-only actions until acknowledged after reconciliation", () => {
    expect(nextAmbiguousTrigger(false, "trigger", { status: "ambiguous" }, false)).toBe(true);
    expect(nextAmbiguousTrigger(true, "collect", { status: "completed" }, false)).toBe(true);
    expect(nextAmbiguousTrigger(true, "trigger", { status: "unavailable" }, false)).toBe(true);
    expect(nextAmbiguousTrigger(true, "trigger", { status: "unavailable" }, true)).toBe(false);
  });
});