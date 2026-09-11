import { describe, expect, it, vi } from "vitest";
import { executeExecutionScript } from "./execution-script-runtime.js";

describe("executeExecutionScript", () => {
  it("returns a machine-readable rejection without touching runtime", async () => {
    const save = vi.fn();
    const run = vi.fn();
    const start = vi.fn();
    const stop = vi.fn();
    const result = await executeExecutionScript({ version: "1" }, { save, run, start, stop });
    expect(result).toMatchObject({ status: "rejected", code: "SCRIPT_INVALID" });
    expect(save).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("saves and runs a valid one-shot script", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockResolvedValue({ status: "ok", result: { title: "Example Domain" } });
    const start = vi.fn();
    const stop = vi.fn();
    const result = await executeExecutionScript({
      version: "1", execution: { mode: "once" },
      task: { adapter: "generic", action: "open", input: { url: "https://example.com" } },
    }, { save, run, start, stop });
    expect(save).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("script-generic-default", "open", {});
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ok", executionId: "script-generic-default", mode: "once" });
  });

  it("saves and starts a valid interval script", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn();
    const start = vi.fn().mockResolvedValue({ status: "started", pid: 123 });
    const stop = vi.fn().mockResolvedValue({ status: "stopped", pid: 99 });
    const result = await executeExecutionScript({
      version: "1", execution: { mode: "interval", id: "daily-example", intervalMinutes: 60 },
      task: { adapter: "generic", action: "open", input: { url: "https://example.com" } },
    }, { save, run, start, stop });
    expect(stop).toHaveBeenCalledWith("daily-example");
    expect(save).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith("daily-example");
    expect(result).toMatchObject({ status: "started", executionId: "daily-example", mode: "interval", pid: 123 });
  });
});
