import type { HarnessAdapter } from "./types.js";
import type { BrowserSession } from "../core/session.js";

export function resolveGenericUrl(args: Record<string, unknown>, config: Record<string, unknown>): string {
  const url = String(args.url || config.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error("generic open requires an http(s) url");
  return url;
}

export const genericAdapter: HarnessAdapter = {
  id: "generic",
  bootstrapUrl: "about:blank",
  async execute(action, args, context) {
    const session = context.browser as BrowserSession | undefined;
    if (!session) throw new Error("generic adapter requires a browser session");
    if (action !== "open") throw new Error(`Unsupported generic action: ${action}`);
    const cfg = ((context.config as { adapterConfig?: Record<string, unknown> } | undefined)?.adapterConfig || {});
    const url = resolveGenericUrl(args, cfg);
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const selector = typeof args.waitForSelector === "string" ? args.waitForSelector : typeof cfg.waitForSelector === "string" ? cfg.waitForSelector : null;
    if (selector) await session.page.locator(selector).waitFor({ state: "attached", timeout: 20_000 });
    return { url: session.page.url(), title: await session.page.title() };
  },
};
