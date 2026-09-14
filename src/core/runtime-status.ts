import type { HarnessConfig } from "./config.js";

export type RuntimeState = Record<string, unknown> & {
  desiredSupervisorStatus?: "RUNNING" | "STOPPED";
  supervisorPid?: number | null;
  supervisorStatus?: string | null;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  lastAction?: string | null;
  lastTriggerAtMs?: number | null;
  lastError?: unknown;
  lastResult?: unknown;
};

export type ReconciledRuntimeState = RuntimeState & {
  desiredStatus: "RUNNING" | "STOPPED";
  observedStatus: "RUNNING" | "STOPPED";
  reason: "process_running" | "process_not_running" | "not_running";
  supervisorPid: number | null;
  nextRunAt: number | null;
};

export function reconcileRuntimeState(
  config: HarnessConfig,
  state: RuntimeState,
  isPidAlive: (pid: number) => boolean,
): ReconciledRuntimeState {
  const persistedPid = typeof state.supervisorPid === "number" && Number.isFinite(state.supervisorPid) ? state.supervisorPid : null;
  const alive = persistedPid !== null && isPidAlive(persistedPid);

  const explicitDesired = state.desiredSupervisorStatus;
  const legacyLooksRunning = config.schedule.type === "interval" && persistedPid !== null && state.supervisorStatus !== "STOPPED";
  const desiredStatus: "RUNNING" | "STOPPED" = explicitDesired ?? (legacyLooksRunning ? "RUNNING" : "STOPPED");

  if (alive) {
    return {
      ...state,
      desiredStatus,
      observedStatus: "RUNNING",
      reason: "process_running",
      supervisorPid: persistedPid,
      nextRunAt: typeof state.nextRunAt === "number" ? state.nextRunAt : null,
    };
  }

  return {
    ...state,
    desiredStatus,
    observedStatus: "STOPPED",
    reason: persistedPid !== null ? "process_not_running" : "not_running",
    supervisorPid: null,
    supervisorStatus: "STOPPED",
    nextRunAt: null,
  };
}
