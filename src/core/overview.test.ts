import { describe, expect, it } from "vitest";
import { buildHarnessOverviewEntry } from "./overview.js";
import { normalizeHarnessConfig } from "./config.js";

describe("buildHarnessOverviewEntry", () => {
  it("summarizes recurring harness progress without exposing full adapter config", () => {
    const config = normalizeHarnessConfig({
      name: "research-hourly",
      adapter: "chatgpt",
      schedule: { type: "interval", intervalMinutes: 60, runOnStart: true },
      adapterConfig: {
        project: { enabled: true, name: "Research" },
        trigger: { prompt: "private prompt" },
      },
    });

    const entry = buildHarnessOverviewEntry(config, {
      desiredSupervisorStatus: "RUNNING",
      supervisorPid: 99,
      supervisorStatus: "WAITING",
      lastRunAt: 100,
      lastAction: "trigger",
      lastTriggerAtMs: 95,
      nextRunAt: 200,
      lastResult: { status: "triggered", url: "https://chatgpt.com/c/private" },
      lastError: null,
    }, () => true);

    expect(entry.name).toBe("research-hourly");
    expect(entry.adapter).toBe("chatgpt");
    expect(entry.schedule).toEqual({ type: "interval", intervalMinutes: 60, runOnStart: true });
    expect(entry.runtime.observedStatus).toBe("RUNNING");
    expect(entry.runtime.lastRunAt).toBe(100);
    expect(entry.runtime.lastAction).toBe("trigger");
    expect(entry.runtime.lastTriggerAt).toBe(95);
    expect(entry.runtime.nextRunAt).toBe(200);
    expect(entry.target).toEqual({
      project: "Research",
      conversation: "new",
      retention: null,
    });
    expect(JSON.stringify(entry)).not.toContain("private prompt");
    expect(JSON.stringify(entry)).not.toContain("/c/private");
  });

  it("summarizes ChatGPT retention without exposing trigger prompt", () => {
    const config = normalizeHarnessConfig({
      name: "earn-hourly",
      adapter: "chatgpt",
      schedule: { type: "interval", intervalMinutes: 60, runOnStart: true },
      adapterConfig: {
        project: { enabled: true, name: "Example Ideas" },
        conversation: { newChatEachRun: true },
        cleanup: { enabled: true, maxConversations: 24 },
        trigger: { prompt: "do not expose me" },
      },
    });

    const entry = buildHarnessOverviewEntry(config, {
      lastResult: {
        apply: false,
        results: [{ project: "Example Ideas", items: [{ id: "private-conversation-id", title: "private title" }] }],
      },
    }, () => false);
    expect(entry.target).toEqual({
      project: "Example Ideas",
      conversation: "new",
      retention: { maxConversations: 24 },
    });
    expect(JSON.stringify(entry)).not.toContain("do not expose me");
    expect(JSON.stringify(entry)).not.toContain("private-conversation-id");
    expect(JSON.stringify(entry)).not.toContain("private title");
  });
});
