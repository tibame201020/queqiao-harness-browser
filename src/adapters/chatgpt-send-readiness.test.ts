import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";
import { nextAmbiguousTrigger } from "../core/trigger-guard.js";

const ID = "11111111-1111-4111-8111-111111111111";

function fixture(options: { generating?: boolean; enabled?: boolean; intercept?: boolean; settleAfter?: number } = {}) {
  let generating = options.generating ?? false;
  let enabled = options.enabled ?? true;
  let url = "https://chatgpt.com/";
  let editorText = "";
  let polls = 0;
  let attemptedSends = 0;
  let typedWhileGenerating = false;
  const composer = {
    count: vi.fn(async () => 1),
    first() { return this; },
    waitFor: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    isVisible: vi.fn(async () => true),
    isEditable: vi.fn(async () => true),
    innerText: vi.fn(async () => editorText),
    textContent: vi.fn(async () => editorText),
    locator: vi.fn(() => form),
  };
  const send = {
    count: vi.fn(async () => 1),
    first() { return this; },
    waitFor: vi.fn(async () => undefined),
    isVisible: vi.fn(async () => true),
    isEnabled: vi.fn(async () => enabled),
    click: vi.fn(async (opts?: { trial?: boolean }) => {
      if (!enabled) throw new Error("disabled send");
      if (opts?.trial) {
        if (options.intercept) throw new Error("intercepted");
        return;
      }
      attemptedSends++;
      if (options.intercept) throw new Error("intercepted after dispatch possibility");
      url = `https://chatgpt.com/c/${ID}`;
    }),
  };
  const form = {
    count: vi.fn(async () => 1),
    first() { return this; },
    locator: vi.fn(() => send),
  };
  const stop = {
    count: vi.fn(async () => generating ? 1 : 0),
    first() { return this; },
    isVisible: vi.fn(async () => generating),
  };
  const page = {
    goto: vi.fn(async () => { url = "https://chatgpt.com/"; }),
    url: vi.fn(() => url),
    locator: vi.fn((selector: string) => {
      if (selector.includes("stop-button") || selector.includes("Stop generating") || selector.includes("停止產生") || selector.includes("停止生成")) return stop;
      if (selector.includes("send-button") || selector.includes('button[type="submit"]')) return send;
      if (selector.includes("#prompt-textarea") || selector.includes('[role="textbox"]')) return composer;
      throw new Error(`unexpected selector ${selector}`);
    }),
    keyboard: { insertText: vi.fn(async (text: string) => {
      if (generating) typedWhileGenerating = true;
      editorText += text;
    }) },
    waitForTimeout: vi.fn(async () => {
      polls++;
      if (polls >= (options.settleAfter ?? 2)) { generating = false; enabled = true; }
    }),
    waitForURL: vi.fn(async () => undefined),
  };
  return { page, composer, send, stop, get polls() { return polls; }, get attemptedSends() { return attemptedSends; }, get typedWhileGenerating() { return typedWhileGenerating; } };
}

const context = (page: unknown) => ({
  browser: { page },
  config: { adapterConfig: { project: { enabled: false }, conversation: { newChatEachRun: true } } },
});

afterEach(() => vi.restoreAllMocks());

describe("ChatGPT generic pre-send readiness (#16)", () => {
  it("waits on an active generation and disabled Send, then dispatches once when both settle", async () => {
    const f = fixture({ generating: true, enabled: false, settleAfter: 3 });
    const result = await chatgptAdapter.execute("trigger", { prompt: "isolated readiness regression" }, context(f.page));
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.polls).toBeGreaterThanOrEqual(3);
    expect(f.typedWhileGenerating).toBe(false);
    expect(f.attemptedSends).toBe(1);
  });

  it("times out before dispatch with structured nonsecret diagnostics", async () => {
    const f = fixture({ generating: true, enabled: false, settleAfter: Number.POSITIVE_INFINITY });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 5000; return now; });
    const prompt = "PRIVATE_CONTENT_DO_NOT_LOG_16";
    const result = await chatgptAdapter.execute("trigger", { prompt }, context(f.page));
    expect(result).toMatchObject({ status: "unavailable", reason: "PRE_SEND_NOT_READY", retryable: true,
      diagnostic: { stage: "precompose", generationActive: true } });
    expect(JSON.stringify(result)).not.toContain(prompt);
    expect(f.attemptedSends).toBe(0);
  });

  it("does not retry or reclassify a failed actual click as safe-to-resend", async () => {
    const f = fixture();
    f.send.click.mockImplementation(async (opts?: { trial?: boolean }) => {
      if (!opts?.trial) throw new Error("locator.click: Timeout 30000ms exceeded");
    });
    const result = await chatgptAdapter.execute("trigger", { prompt: "PRIVATE_CONTENT_DO_NOT_LOG_16" }, context(f.page));
    expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false,
      diagnostic: { stage: "click", sendActionable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CONTENT_DO_NOT_LOG_16");
    expect(f.send.click.mock.calls.filter((args) => !args[0]?.trial)).toHaveLength(1);
  });

  it("returns an ambiguity receipt if post-click conversation identity cannot be confirmed", async () => {
    const f = fixture();
    f.page.waitForURL.mockRejectedValueOnce(new Error("navigation timeout after click"));
    const result = await chatgptAdapter.execute("trigger", { prompt: "postclick isolation" }, context(f.page));
    expect(result).toMatchObject({ status: "ambiguous", reason: "CONVERSATION_ID_NOT_CONFIRMED", retryable: false,
      diagnostic: { stage: "postclick" } });
    expect(nextAmbiguousTrigger(false, "trigger", result, false)).toBe(true);
    expect(f.attemptedSends).toBe(1);
  });

  it("classifies a permanently intercepted trial click as pre-send, without dispatch", async () => {
    const f = fixture({ intercept: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 3000; return now; });
    const result = await chatgptAdapter.execute("trigger", { prompt: "overlay regression" }, context(f.page));
    expect(result).toMatchObject({ status: "unavailable", reason: "PRE_SEND_NOT_READY",
      diagnostic: { stage: "presend", sendActionable: false } });
    expect(f.attemptedSends).toBe(0);
    expect(f.send.click.mock.calls.every((args) => args[0]?.trial === true)).toBe(true);
  });

  it("preserves an ordinary prompt containing a connected-app mention as editor input", async () => {
    const f = fixture();
    const prompt = "Use @Queqiao to list workspaces; do not add a provider-specific action.";
    const result = await chatgptAdapter.execute("trigger", { prompt }, context(f.page));
    expect(result).toMatchObject({ status: "triggered" });
    expect(f.page.keyboard.insertText).toHaveBeenCalledWith(prompt);
    expect(f.attemptedSends).toBe(1);
  });
});
