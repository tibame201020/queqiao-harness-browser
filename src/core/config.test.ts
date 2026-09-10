import { describe, expect, it } from "vitest";
import { normalizeHarnessConfig } from "./config.js";

describe("normalizeHarnessConfig", () => {
  it("defaults a manual chromium profile without embedding site-specific behavior", () => {
    const cfg = normalizeHarnessConfig({ name: "demo", adapter: "generic" });
    expect(cfg.name).toBe("demo");
    expect(cfg.browser.engine).toBe("chromium");
    expect(cfg.browser.channel).toBe("chrome");
    expect(cfg.browser.headless).toBe(true);
    expect(cfg.browser.startMinimized).toBe(true);
    expect(cfg.schedule.type).toBe("manual");
    expect(cfg.runPolicy.leaseMinutes).toBe(50);
  });

  it("requires intervalMinutes for interval schedules", () => {
    expect(() => normalizeHarnessConfig({ name: "demo", adapter: "generic", schedule: { type: "interval" } as any })).toThrow(/intervalMinutes/);
  });

  it("keeps adapter config opaque to the browser core", () => {
    const cfg = normalizeHarnessConfig({ name: "demo", adapter: "chatgpt", adapterConfig: { projectName: "X" } });
    expect(cfg.adapterConfig).toEqual({ projectName: "X" });
  });
});
