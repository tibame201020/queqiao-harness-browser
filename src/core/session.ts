import fs from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { HarnessConfig } from "./config.js";
import { managedBrowserArgs, resolveBrowserExecutable } from "./browser.js";
import { profilePaths } from "./store.js";
import { CdpEndpointUnavailableError, isCdpConnectionRefused, recoverOwnedCdp } from "./cdp-recovery.js";

export type BrowserSession = { context: BrowserContext; page: Page; close(): Promise<void> };

export async function openBrowserSession(config: HarnessConfig, home: string): Promise<BrowserSession> {
  if (config.browser.connection === "cdp") {
    // Do not apply Playwright default overrides to an attached daily-driver browser.
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>;
    try {
      browser = await chromium.connectOverCDP(config.browser.cdpUrl!, { noDefaults: true });
    } catch (error) {
      if (!isCdpConnectionRefused(error)) throw error;
      if (config.browser.cdpRecovery !== "harness-owned") {
        throw new CdpEndpointUnavailableError("absent", {
          mode: "attach-only", attempted: false, outcome: "disabled",
        });
      }
      // Transport setup happens before any site action or possible SendAttempt.
      // One bounded relaunch + exactly one reconnect; never replay a Trigger.
      const recovered = await recoverOwnedCdp(config, home);
      try {
        browser = await chromium.connectOverCDP(config.browser.cdpUrl!, { noDefaults: true });
      } catch {
        throw new CdpEndpointUnavailableError("unknown", {
          mode: "harness-owned", attempted: recovered.attempted, outcome: "reconnect_failed",
        });
      }
    }
    const context = browser.contexts()[0];
    if (!context) {
      await browser.close();
      throw new Error("CDP browser has no context");
    }
    try {
      // Do not hijack any existing user-owned tab. Own one new tab per run.
      const page = await context.newPage();
      // Close our tab, then disconnect; keep the persistent context and Chrome alive.
      return { context, page, close: async () => {
        try { await page.close(); } finally { await browser.close(); }
      } };
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
