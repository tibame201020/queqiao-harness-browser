import { describe, expect, it, vi } from "vitest";
import { bootstrapClose, closeBrowserCdp } from "./bootstrap.js";
import { normalizeHarnessConfig } from "./config.js";

describe("bootstrap close", () => {
  it("Issue #75: bootstrap close cannot close any attached CDP browser",async()=>{
    for(const recovery of ["attach-only","harness-owned"] as const){
      const config=normalizeHarnessConfig({name:"test-"+recovery,adapter:"chatgpt",browser:{
        connection:"cdp",cdpUrl:"http://127.0.0.1:18985",
        ...(recovery==="harness-owned"?{debugPort:18985}:{}),cdpRecovery:recovery,
      }});
      await expect(bootstrapClose(config)).rejects.toThrow("bootstrap requires a managed browser profile");
    }
  });
  it("sends Browser.close through a browser CDP session", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const browser = { newBrowserCDPSession: vi.fn().mockResolvedValue({ send }) };
    await closeBrowserCdp(browser as never);
    expect(browser.newBrowserCDPSession).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Browser.close");
  });
});
