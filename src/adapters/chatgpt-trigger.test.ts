import { describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";

describe("ChatGPT composer compatibility", () => {
  it("sends a prompt with a modern contenteditable textbox and a submit button, not only legacy test IDs", async () => {
    const composer = {
      waitFor: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
    };
    const send = {
      waitFor: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
    };
    const lookup = vi.fn((selector: string) => {
      if (selector.includes('form:has(') && selector.includes('button[type="submit"]')) {
        return { first: () => send };
      }
      if (selector.includes('[role="textbox"][contenteditable="true"]')) {
        return { first: () => composer };
      }
      throw new Error("Current ChatGPT interface has no legacy selector: " + selector);
    });
    const page = {
      goto: vi.fn(async () => undefined),
      locator: lookup,
      keyboard: { insertText: vi.fn(async () => undefined) },
      waitForURL: vi.fn(async () => undefined),
      url: () => "https://chatgpt.com/c/11111111-1111-4111-8111-111111111111",
    };
    const result = await chatgptAdapter.execute("trigger", { prompt: "Gate C harness probe" }, {
      browser: { page },
      config: { adapterConfig: { project: { enabled: false }, conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered" });
    expect(page.keyboard.insertText).toHaveBeenCalledWith("Gate C harness probe");
    expect(send.click).toHaveBeenCalledTimes(1);
  });
});
describe("ChatGPT pinned plugin target", () => {
  it("opens the requested plugin's Try in chat before sending the prompt", async () => {
    const calls: string[] = [];
    const composer = {
      waitFor: vi.fn(async () => undefined),
      click: vi.fn(async () => calls.push("composer")),
    };
    const send = {
      waitFor: vi.fn(async () => undefined),
      click: vi.fn(async () => calls.push("send")),
    };
    const tryInChat = {
      waitFor: vi.fn(async () => undefined),
      click: vi.fn(async () => calls.push("try-in-chat")),
    };
    const page = {
      goto: vi.fn(async (url: string) => { calls.push("goto:" + url); }),
      getByRole: vi.fn(() => tryInChat),
      locator: vi.fn((selector: string) => {
        return { first: () => selector.includes("button[type=") ? send : composer };
      }),
      keyboard: { insertText: vi.fn(async () => calls.push("typing")) },
      waitForURL: vi.fn(async () => undefined),
      url: () => "https://chatgpt.com/c/11111111-1111-4111-8111-111111111111",
    };
    const response = await chatgptAdapter.execute("trigger", { prompt: "Use plugin to verify worker" }, {
      browser: { page }, config: { adapterConfig: {
        conversation: { newChatEachRun: true }, trigger: {
          pluginId: "plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      } },
    });
    expect(response).toMatchObject({ status: "triggered" });
    expect(page.goto).toHaveBeenCalledWith(
      "https://chatgpt.com/plugins/plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expect.any(Object),
    );
    expect(calls.indexOf("try-in-chat")).toBeGreaterThan(calls.findIndex(x => x.startsWith("goto:")));
    expect(calls.indexOf("try-in-chat")).toBeLessThan(calls.indexOf("typing"));
  });
});
