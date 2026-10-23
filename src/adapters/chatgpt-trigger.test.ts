import { describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";

const ID = "11111111-1111-4111-8111-111111111111";

function fixture(opts: { legacy?: boolean; plugin?: boolean; resume?: boolean } = {}) {
  const calls: string[] = [];
  let editorText = "";
  let url = "https://chatgpt.com/";
  const send = {
    count: vi.fn(async () => 1), first() { return this; },
    isVisible: vi.fn(async () => true), isEnabled: vi.fn(async () => true),
    click: vi.fn(async (args?: { trial?: boolean }) => {
      if (!args?.trial) { calls.push("send"); if (!opts.resume) url = `https://chatgpt.com/c/${ID}`; }
    }),
  };
  const form = {
    count: vi.fn(async () => opts.legacy ? 0 : 1),
    locator: vi.fn(() => send),
  };
  const composer = {
    count: vi.fn(async () => 1), first() { return this; },
    isVisible: vi.fn(async () => true), isEditable: vi.fn(async () => true),
    innerText: vi.fn(async () => editorText), textContent: vi.fn(async () => editorText),
    evaluate: vi.fn(async () => editorText),
    locator: vi.fn(() => form),
    click: vi.fn(async () => { calls.push("composer"); }),
  };
  const stop = { first() { return this; }, isVisible: vi.fn(async () => false) };
  const tryInChat = {
    waitFor: vi.fn(async () => undefined),
    click: vi.fn(async () => { calls.push("try-in-chat"); url = "https://chatgpt.com/"; }),
  };
  const page = {
    goto: vi.fn(async (target: string) => { calls.push("goto:" + target); url = target; }),
    getByRole: vi.fn(() => tryInChat),
    locator: vi.fn((selector: string) => {
      if (/stop-button|Stop generating|停止產生|停止生成/.test(selector)) return stop;
      if (selector.includes("send-button") || selector.includes('button[type="submit"]')) return send;
      if (selector.includes("#prompt-textarea") || selector.includes('[role="textbox"]')) return composer;
      throw new Error("Unexpected selector " + selector);
    }),
    keyboard: { insertText: vi.fn(async (value: string) => { calls.push("typing"); editorText += value; }) },
    waitForTimeout: vi.fn(async () => undefined),
    waitForURL: vi.fn(async () => undefined),
    url: vi.fn(() => url),
  };
  return { page, calls, send, composer, form };
}

describe("ChatGPT composer compatibility", () => {
  it("sends with the current contenteditable textbox and its own form submit control", async () => {
    const f = fixture();
    const result = await chatgptAdapter.execute("trigger", { prompt: "Gate C harness probe" }, {
      browser: { page: f.page },
      config: { adapterConfig: { project: { enabled: false }, conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.form.locator).toHaveBeenCalledWith(expect.stringContaining('button[type="submit"]'));
    expect(f.page.keyboard.insertText).toHaveBeenCalledWith("Gate C harness probe");
    expect(f.send.click.mock.calls.filter((args) => !args[0]?.trial)).toHaveLength(1);
  });

  it("also supports a unique legacy test-ID Send outside an editor form", async () => {
    const f = fixture({ legacy: true });
    const result = await chatgptAdapter.execute("trigger", { prompt: "legacy layout" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered" });
    expect(f.page.locator).toHaveBeenCalledWith('[data-testid="send-button"]:visible');
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("preserves the installed plugin Try in chat flow", async () => {
    const f = fixture({ plugin: true });
    const response = await chatgptAdapter.execute("trigger", { prompt: "Use plugin to verify worker" }, {
      browser: { page: f.page }, config: { adapterConfig: {
        conversation: { newChatEachRun: true }, trigger: {
          pluginId: "plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      } },
    });
    expect(response).toMatchObject({ status: "triggered" });
    expect(f.page.goto).toHaveBeenCalledWith(
      "https://chatgpt.com/plugins/plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expect.any(Object),
    );
    expect(f.calls.indexOf("try-in-chat")).toBeGreaterThan(f.calls.findIndex(x => x.startsWith("goto:")));
    expect(f.calls.indexOf("try-in-chat")).toBeLessThan(f.calls.indexOf("typing"));
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("preserves an existing conversation target without creating another conversation", async () => {
    const f = fixture({ resume: true });
    const result = await chatgptAdapter.execute("trigger", { prompt: "resumed generic conversation" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(f.page.goto).toHaveBeenCalledWith(`https://chatgpt.com/c/${ID}`, expect.any(Object));
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });
});
