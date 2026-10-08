import fs from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { HarnessConfig } from "./config.js";
import { managedBrowserArgs, resolveBrowserExecutable } from "./browser.js";
import { profilePaths } from "./store.js";

export type BrowserSession = { context: BrowserContext; page: Page; close(): Promise<void> };

export async function openBrowserSession(config: HarnessConfig, home: string): Promise<BrowserSession> {
  if (config.browser.connection === "cdp") {
    const browser = await chromium.connectOverCDP(config.browser.cdpUrl!);
    const context = browser.contexts()[0];
    if (!context) {
      await browser.close();
      throw new Error("CDP browser has no context");
    }
    try {
      const page = context.pages()[0] ?? await context.newPage();
      // For a CDP-attached Browser, close() disconnects Playwright;
      // it does not shut down the persistent user-owned Chrome process.
      return { context, page, close: async () => browser.close() };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }
  const executablePath = resolveBrowserExecutable({ channel: config.browser.channel, executablePath: config.browser.executablePath });
  const userDataDir = config.browser.userDataDir ?? profilePaths(home, config.name).browserProfile;
  await fs.mkdir(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath, headless: config.browser.headless,
    args: managedBrowserArgs({ headless: config.browser.headless, startMinimized: config.browser.startMinimized }),
  });
  return {
    context,
    page: context.pages()[0] ?? await context.newPage(),
    close: async () => context.close(),
  };
}
