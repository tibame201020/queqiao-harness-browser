import { describe, expect, it } from "vitest";
import { reconcileRuntimeState } from "./runtime-status.js";
import { normalizeHarnessConfig } from "./config.js";

describe("reconcileRuntimeState", () => {
  const config = normalizeHarnessConfig({
    name: "recurring-demo",
    adapter: "generic",
    schedule: { type: "interval", intervalMinutes: 60, runOnStart: true },
  });

  it("reports a stale persisted supervisor pid as stopped while preserving desired running state", () => {
    const result = reconcileRuntimeState(config, {
      supervisorPid: 7200,
      supervisorStatus: "WAITING",
      nextRunAt: 123456,
      lastRunAt: 120000,
    }, () => false);

    expect(result.desiredStatus).toBe("RUNNING");
    expect(result.observedStatus).toBe("STOPPED");
    expect(result.reason).toBe("process_not_running");
    expect(result.supervisorPid).toBeNull();
    expect(result.nextRunAt).toBeNull();
    expect(result.lastRunAt).toBe(120000);
  });

  it("reports a live supervisor as running", () => {
    const result = reconcileRuntimeState(config, {
      desiredSupervisorStatus: "RUNNING",
      supervisorPid: 42,
      supervisorStatus: "WAITING",
      nextRunAt: 999,
    }, (pid) => pid === 42);

    expect(result.desiredStatus).toBe("RUNNING");
    expect(result.observedStatus).toBe("RUNNING");
    expect(result.supervisorStatus).toBe("WAITING");
    expect(result.supervisorPid).toBe(42);
    expect(result.nextRunAt).toBe(999);
  });

  it("distinguishes an explicitly stopped harness from an unexpectedly dead one", () => {
    const result = reconcileRuntimeState(config, {
      desiredSupervisorStatus: "STOPPED",
      supervisorPid: null,
      supervisorStatus: "STOPPED",
    }, () => false);

    expect(result.desiredStatus).toBe("STOPPED");
    expect(result.observedStatus).toBe("STOPPED");
    expect(result.reason).toBe("not_running");
  });
});
