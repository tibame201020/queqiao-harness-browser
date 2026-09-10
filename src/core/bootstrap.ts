import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import type { HarnessConfig } from "./config.js";
import { resolveBrowserExecutable } from "./browser.js";
import { profilePaths } from "./store.js";

export function deterministicDebugPort(name: string): number {
  let h = 0; for (const c of name) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return 18000 + (h % 1000);
}

async function ready(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
    const j = await r.json() as { webSocketDebuggerUrl?: string };
    return r.ok && Boolean(j.webSocketDebuggerUrl);
  } catch { return false; }
}

export async function bootstrapOpen(config: HarnessConfig, home: string, startUrl: string) {
  if (config.browser.connection !== "managed") throw new Error("bootstrap requires a managed browser profile");
  const port = config.browser.debugPort ?? deterministicDebugPort(config.name);
  if (await ready(port)) return { port, alreadyRunning: true };
  const exe = resolveBrowserExecutable({ channel: config.browser.channel, executablePath: config.browser.executablePath });
  const dir = config.browser.userDataDir ?? profilePaths(home, config.name).browserProfile;
  await fs.mkdir(dir, { recursive: true });
  const child = spawn(exe, [`--user-data-dir=${dir}`, "--profile-directory=Default", `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", startUrl], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await ready(port)) return { port, alreadyRunning: false }; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`Bootstrap browser did not become ready on ${port}`);
}

export async function closeBrowserCdp(browser: Pick<Browser, "newBrowserCDPSession">): Promise<void> {
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close");
}

export async function bootstrapClose(config: HarnessConfig): Promise<boolean> {
  const port = config.browser.debugPort ?? deterministicDebugPort(config.name);
  if (!(await ready(port))) return false;
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await closeBrowserCdp(browser);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await ready(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Bootstrap browser did not close on ${port}`);
}
