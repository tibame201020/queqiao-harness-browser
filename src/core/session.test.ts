import { beforeEach, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright-core";
import { normalizeHarnessConfig } from "./config.js";
import { openBrowserSession } from "./session.js";

vi.mock("playwright-core", () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launchPersistentContext: vi.fn(),
  },
}));

describe("CDP session lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disconnects its Playwright CDP client after a run without closing the persistent context", async () => {
    const page = { url: () => "https://chatgpt.com/" };
    const context = {
      pages: vi.fn().mockReturnValue([page]),
      close: vi.fn(),
    };
    const browser = {
      contexts: vi.fn().mockReturnValue([context]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as never);
    const config = normalizeHarnessConfig({
      name: "test-persistent-browser",
      adapter: "chatgpt",
      browser: {
        engine: "chromium",
        channel: "chrome",
        connection: "cdp",
        cdpUrl: "http://127.0.0.1:9555",
        headless: false,
        startMinimized: true,
      },
    });

    const session = await openBrowserSession(config, "unused");

    expect(session.page).toBe(page);
    await session.close();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it("disconnects a CDP client even if no browser context exists", async () => {
    const browser = {
      contexts: vi.fn().mockReturnValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as never);
    const config = normalizeHarnessConfig({
      name: "test-persistent-browser",
      adapter: "chatgpt",
      browser: {
        engine: "chromium",
        channel: "chrome",
        connection: "cdp",
        cdpUrl: "http://127.0.0.1:9555",
        headless: false,
        startMinimized: true,
      },
    });

    await expect(openBrowserSession(config, "unused")).rejects.toThrow("CDP browser has no context");
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
