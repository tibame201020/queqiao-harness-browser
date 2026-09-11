import { describe, expect, it } from "vitest";
import { compileExecutionScript, ExecutionScriptError } from "./execution-script.js";

function expectScriptError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected script compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ExecutionScriptError);
    expect((error as ExecutionScriptError).code).toBe(code);
  }
}

describe("execution script contract", () => {
  it("compiles a resolved generic one-shot script", () => {
    const result = compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: { adapter: "generic", action: "open", input: { url: "https://example.com" } },
    });

    expect(result.action).toBe("open");
    expect(result.args).toEqual({});
    expect(result.config.adapter).toBe("generic");
    expect(result.config.browser.headless).toBe(true);
    expect(result.config.schedule).toEqual({ type: "manual" });
    expect(result.config.adapterConfig).toEqual({ url: "https://example.com" });
    expect(result.executionId).toBe("script-generic-default");
  });

  it("reuses one-shot browser identity across changing ChatGPT prompts", () => {
    const result = compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: {
        adapter: "chatgpt",
        action: "trigger",
        target: {
          project: { mode: "existing", name: "Demo" },
          conversation: { mode: "new" },
        },
        input: { prompt: "Summarize the project." },
      },
    });

    expect(result.executionId).toBe("script-chatgpt-default");
    expect(result.config.browser.headless).toBe(false);
    expect(result.config.browser.startMinimized).toBe(true);
    expect(result.config.adapterConfig).toMatchObject({
      project: { enabled: true, name: "Demo" },
      conversation: { newChatEachRun: true },
      cleanup: { enabled: false },
      trigger: { prompt: "Summarize the project." },
    });
  });

  it("fails when an existing ChatGPT project has no name", () => {
    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: {
        adapter: "chatgpt",
        action: "trigger",
        target: { project: { mode: "existing" }, conversation: { mode: "new" } },
        input: { prompt: "Run" },
      },
    }), "SCRIPT_INVALID");
  });

  it("fails when conversation reuse has no conversation id", () => {
    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: {
        adapter: "chatgpt",
        action: "trigger",
        target: { project: { mode: "none" }, conversation: { mode: "reuse" } },
        input: { prompt: "Continue" },
      },
    }), "SCRIPT_INVALID");
  });

  it("rejects unsupported adapters and actions deterministically", () => {
    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: { adapter: "unknown", action: "do_anything" },
    }), "SCRIPT_UNSUPPORTED");

    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: { adapter: "generic", action: "click", input: {} },
    }), "SCRIPT_UNSUPPORTED");
  });

  it("requires a stable execution id for interval scripts", () => {
    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "interval", intervalMinutes: 60 },
      task: { adapter: "generic", action: "open", input: { url: "https://example.com" } },
    }), "SCRIPT_INVALID");

    const result = compileExecutionScript({
      version: "1",
      execution: { mode: "interval", id: "daily-example", intervalMinutes: 60, runOnStart: false },
      task: { adapter: "generic", action: "open", input: { url: "https://example.com" } },
    });
    expect(result.executionId).toBe("daily-example");
    expect(result.config.schedule).toEqual({ type: "interval", intervalMinutes: 60, runOnStart: false });
  });

  it("requires explicit script authorization for destructive cleanup", () => {
    expectScriptError(() => compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      task: {
        adapter: "chatgpt",
        action: "cleanup",
        target: { project: { mode: "existing", name: "Demo" } },
        input: { apply: true },
      },
    }), "SCRIPT_AUTH_REQUIRED");

    const result = compileExecutionScript({
      version: "1",
      execution: { mode: "once" },
      authorization: { destructive: true },
      task: {
        adapter: "chatgpt",
        action: "cleanup",
        target: { project: { mode: "existing", name: "Demo" } },
        input: { apply: true },
      },
    });
    expect(result.args).toEqual({ apply: true, projectName: "Demo" });
  });
});
