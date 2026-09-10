import { leaseRemainingMs } from "./state.js";

export function nextSupervisorDecision(input: { nowMs: number; lastTriggerAtMs?: number | null; leaseMs: number }): { kind: "run" } | { kind: "busy"; retryAfterMs: number } {
  const remaining = leaseRemainingMs({ lastTriggerAtMs: input.lastTriggerAtMs }, input.nowMs, input.leaseMs);
  return remaining > 0 ? { kind: "busy", retryAfterMs: remaining } : { kind: "run" };
}
