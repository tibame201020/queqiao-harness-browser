import { describe, expect, it, vi } from "vitest";
import { claudeAdapter, claudeSite } from "./claude-adapter.js";
import { mistralAdapter, mistralSite } from "./mistral-adapter.js";
import { grokAdapter, grokSite } from "./grok-adapter.js";
import { conversationIdentity, normalizeWebChatConfig, decideCollect, safeConversationUrl } from "./web-chat.js";

const sites = [claudeSite, mistralSite, grokSite];
describe("provider-scoped chat contracts", () => {
  it("registers three different adapters, origins and selectors", () => {
    expect([claudeAdapter.id, mistralAdapter.id, grokAdapter.id]).toEqual(["claude", "mistral", "grok"]);
    expect(new Set(sites.map(s => s.origin)).size).toBe(3);
    expect(new Set(sites.map(s => s.editor)).size).toBe(3);
  });
  it.each(sites)("rejects foreign origins and mismatched IDs: $id", (site) => {
    expect(conversationIdentity(site, site.origin + "/chat/abcDEF12")).toBe("abcDEF12");
    expect(conversationIdentity(site, "https://attacker.invalid/chat/abcDEF12")).toBeNull();
    expect(conversationIdentity(site, site.origin + "/chat/new")).toBeNull();
    expect(conversationIdentity(site, site.origin + "/chat/abcDEF12/extra")).toBeNull();
    expect(() => safeConversationUrl(site, site.origin + "/chat/abcDEF12", "different12")).toThrow();
    expect(safeConversationUrl(site, site.origin + "/chat/abcDEF12", "abcDEF12")).toBe(site.origin + "/chat/abcDEF12");
  });
  it("rejects unsupported connector strategies and reused trigger targets", () => {
    expect(() => normalizeWebChatConfig({connector:{strategy:"oauth-register"}})).toThrow();
    expect(() => normalizeWebChatConfig({ conversation:{newChatEachRun:false} })).toThrow();
    expect(normalizeWebChatConfig({}).connector.strategy).toBe("preconnected");
  });
  it("does not confuse empty, generation, transient failure and completion", () => {
    const snapshot = { assistantCount: 0, text: "", generating: false, loadError: false };
    expect(decideCollect(snapshot, 0, false)).toBe("pending");
    expect(decideCollect({...snapshot, generating:true}, 0, false)).toBe("generating");
    expect(decideCollect({...snapshot, loadError:true}, 0, false)).toBe("unavailable");
    expect(decideCollect({...snapshot, assistantCount:1, text:"partial", generating:true}, 2, true)).toBe("generating");
    expect(decideCollect({...snapshot, assistantCount:1, text:"done"}, 2, true)).toBe("completed");
    expect(decideCollect({...snapshot, assistantCount:1, text:"done"}, 0, false)).toBe("pending");
  });
  it("never attempts a duplicate submit when a send outcome is ambiguous", async () => {
    const send = {waitFor:vi.fn().mockResolvedValue(undefined), click:vi.fn().mockRejectedValue(new Error("CDP timeout"))};
    const composer = {waitFor:vi.fn().mockResolvedValue(undefined), fill:vi.fn().mockResolvedValue(undefined), isVisible:vi.fn().mockResolvedValue(true)};
    const page:any = {
      url:()=>claudeSite.origin+"/new", goto:vi.fn().mockResolvedValue(undefined),
      locator:vi.fn((selector:string)=> ({ first:()=> selector===claudeSite.editor ? composer : send,
        isVisible:vi.fn().mockResolvedValue(false) })),
      waitForTimeout:vi.fn().mockResolvedValue(undefined)
    };
    // A real page's hydration is provider-specific. The ambiguity boundary is tested at the action layer.
    const r:any = await claudeAdapter.execute("trigger",{prompt:"readonly"},{
      browser:{page}, config:{adapterConfig:{connector:{strategy:"preconnected"}}}
    });
    expect(r.status).toBe("ambiguous");
    expect(send.click).toHaveBeenCalledTimes(1);
  });
});
