import { describe, expect, it } from "vitest";
import { nextSupervisorDecision } from "./supervisor.js";

describe("nextSupervisorDecision", () => {
  it("blocks while a lease is active", () => {
    expect(nextSupervisorDecision({ nowMs: 10000, lastTriggerAtMs: 9000, leaseMs: 5000 })).toEqual({ kind: "busy", retryAfterMs: 4000 });
  });
  it("runs when the lease is expired", () => {
    expect(nextSupervisorDecision({ nowMs: 10000, lastTriggerAtMs: 1000, leaseMs: 5000 })).toEqual({ kind: "run" });
  });
});
