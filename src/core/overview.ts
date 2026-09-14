import type { HarnessConfig } from "./config.js";
import { reconcileRuntimeState, type RuntimeState } from "./runtime-status.js";

type ChatGptTargetSummary = {
  project: string | null;
  conversation: "new" | "reuse";
  retention: { maxConversations: number } | null;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function summarizeChatGptTarget(config: HarnessConfig): ChatGptTargetSummary | null {
  if (config.adapter !== "chatgpt") return null;
  const adapter = readRecord(config.adapterConfig);
  const project = readRecord(adapter?.project);
  const conversation = readRecord(adapter?.conversation);
  const cleanup = readRecord(adapter?.cleanup);

  const projectName = project?.enabled === true && typeof project.name === "string" ? project.name : null;
  const conversationMode = conversation?.newChatEachRun === false ? "reuse" : "new";
  const maxConversations = cleanup?.enabled === true && typeof cleanup.maxConversations === "number"
    ? cleanup.maxConversations
    : null;

  return {
    project: projectName,
    conversation: conversationMode,
    retention: maxConversations === null ? null : { maxConversations },
  };
}

export function buildHarnessOverviewEntry(
  config: HarnessConfig,
  state: RuntimeState,
  isPidAlive: (pid: number) => boolean,
) {
  const runtime = reconcileRuntimeState(config, state, isPidAlive);
  return {
    name: config.name,
    adapter: config.adapter,
    schedule: config.schedule,
    lifecycle: config.lifecycle,
    target: summarizeChatGptTarget(config),
    runtime: {
      desiredStatus: runtime.desiredStatus,
      observedStatus: runtime.observedStatus,
      reason: runtime.reason,
      supervisorStatus: runtime.supervisorStatus ?? null,
      supervisorPid: runtime.supervisorPid,
      lastRunAt: typeof runtime.lastRunAt === "number" ? runtime.lastRunAt : null,
      lastAction: typeof runtime.lastAction === "string" ? runtime.lastAction : null,
      lastTriggerAt: typeof runtime.lastTriggerAtMs === "number" ? runtime.lastTriggerAtMs : null,
      nextRunAt: runtime.nextRunAt,
      lastError: runtime.lastError ?? null,
    },
  };
}
