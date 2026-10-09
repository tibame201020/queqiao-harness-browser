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
