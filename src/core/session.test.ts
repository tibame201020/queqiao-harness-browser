import { beforeEach, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright-core";
import { normalizeHarnessConfig } from "./config.js";
import { openBrowserSession } from "./session.js";
import { recoverOwnedCdp } from "./cdp-recovery.js";

vi.mock("./cdp-recovery.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./cdp-recovery.js")>(),
  recoverOwnedCdp: vi.fn(),
}));

vi.mock("playwright-core", () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launchPersistentContext: vi.fn(),
  },
}));

describe("CDP session lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Issue #75 RED: missing attach-only CDP returns structured unavailable without opening site or Send",async()=>{
    vi.mocked(chromium.connectOverCDP).mockRejectedValueOnce(new Error("browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:18985"));
    const cfg=normalizeHarnessConfig({name:"external",adapter:"chatgpt",browser:{connection:"cdp",cdpUrl:"http://127.0.0.1:18985"}});
    await expect(openBrowserSession(cfg,"synthetic-home")).rejects.toMatchObject({
      code:"CDP_ENDPOINT_UNAVAILABLE",endpointStatus:"absent",
      recovery:{mode:"attach-only",attempted:false,outcome:"disabled"},
    });
    expect(chromium.connectOverCDP).toHaveBeenCalledOnce();
    expect(recoverOwnedCdp).not.toHaveBeenCalled();
  });
  it("Issue #75 RED: reconnects exactly once after single opt-in recovery and owns only a new tab",async()=>{
    const page={close:vi.fn().mockResolvedValue(undefined)};
    const externalPage={close:vi.fn()};
    const context={pages:vi.fn().mockReturnValue([externalPage]),newPage:vi.fn().mockResolvedValue(page),close:vi.fn()};
    const browser={contexts:vi.fn().mockReturnValue([context]),close:vi.fn().mockResolvedValue(undefined)};
    vi.mocked(chromium.connectOverCDP)
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:18985"))
      .mockResolvedValueOnce(browser as never);
    vi.mocked(recoverOwnedCdp).mockResolvedValue({attempted:true,outcome:"recovered"});
    const cfg=normalizeHarnessConfig({name:"private-owned",adapter:"chatgpt",browser:{
      connection:"cdp",cdpUrl:"http://127.0.0.1:18985",debugPort:18985,cdpRecovery:"harness-owned",
    }});
    const session=await openBrowserSession(cfg,"synthetic-home");
    expect(recoverOwnedCdp).toHaveBeenCalledExactlyOnceWith(cfg,"synthetic-home");
    expect(chromium.connectOverCDP).toHaveBeenCalledTimes(2);
    expect(context.newPage).toHaveBeenCalledOnce();
    await session.close();
    expect(page.close).toHaveBeenCalledOnce();
    expect(externalPage.close).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
  });
  it("Issue #75 RED: recovered endpoint still refusing returns sanitized structured recovery failure",async()=>{
    vi.mocked(chromium.connectOverCDP).mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:18985"));
    vi.mocked(recoverOwnedCdp).mockResolvedValue({attempted:true,outcome:"recovered"});
    const cfg=normalizeHarnessConfig({name:"private-owned",adapter:"chatgpt",browser:{
      connection:"cdp",cdpUrl:"http://127.0.0.1:18985",debugPort:18985,cdpRecovery:"harness-owned",
    }});
    await expect(openBrowserSession(cfg,"synthetic-home")).rejects.toMatchObject({
      code:"CDP_ENDPOINT_UNAVAILABLE",endpointStatus:"unknown",
      recovery:{mode:"harness-owned",attempted:true,outcome:"reconnect_failed"},
    });
    expect(chromium.connectOverCDP).toHaveBeenCalledTimes(2);
    expect(recoverOwnedCdp).toHaveBeenCalledOnce();
  });
  it("creates and closes its own CDP tab without affecting user-owned tabs or context", async () => {
    const userPage = { url: () => "https://chatgpt.com/", close: vi.fn() };
    const page = { url: () => "about:blank", close: vi.fn().mockResolvedValue(undefined) };
    const context = {
      pages: vi.fn().mockReturnValue([userPage]),
      newPage: vi.fn().mockResolvedValue(page),
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
    expect(context.newPage).toHaveBeenCalledOnce();
    expect(chromium.connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9555", { noDefaults: true });
    await session.close();
    expect(page.close).toHaveBeenCalledOnce();
    expect(userPage.close).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it("allocates distinct owned pages for simultaneous CDP Collect runs", async () => {
    const owned=[{close:vi.fn().mockResolvedValue(undefined)},{close:vi.fn().mockResolvedValue(undefined)}];
    const context={newPage:vi.fn().mockResolvedValueOnce(owned[0]).mockResolvedValueOnce(owned[1]),pages:vi.fn().mockReturnValue([])};
    const browsers=[0,1].map(()=>({contexts:vi.fn().mockReturnValue([context]),close:vi.fn().mockResolvedValue(undefined)}));
    vi.mocked(chromium.connectOverCDP).mockResolvedValueOnce(browsers[0] as never).mockResolvedValueOnce(browsers[1] as never);
    const config=normalizeHarnessConfig({name:"synthetic",adapter:"chatgpt",browser:{engine:"chromium",channel:"chrome",connection:"cdp",cdpUrl:"http://127.0.0.1:9555",headless:false}});
    const sessions=await Promise.all([openBrowserSession(config,"unused"),openBrowserSession(config,"unused")]);
    expect(sessions[0].page).not.toBe(sessions[1].page);
    expect(context.newPage).toHaveBeenCalledTimes(2);
    await Promise.all(sessions.map(s=>s.close()));
    expect(owned[0].close).toHaveBeenCalledOnce();expect(owned[1].close).toHaveBeenCalledOnce();
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
