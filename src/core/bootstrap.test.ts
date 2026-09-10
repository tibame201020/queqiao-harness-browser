import { describe, expect, it, vi } from "vitest";
import { closeBrowserCdp } from "./bootstrap.js";

describe("bootstrap close", () => {
  it("sends Browser.close through a browser CDP session", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const browser = { newBrowserCDPSession: vi.fn().mockResolvedValue({ send }) };
    await closeBrowserCdp(browser as never);
    expect(browser.newBrowserCDPSession).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Browser.close");
  });
});
