import { describe, expect, it, vi, afterEach } from "vitest";
import { claudeAdapter, claudeSite } from "./claude-adapter.js";
import { mistralAdapter, mistralSite } from "./mistral-adapter.js";
import { grokAdapter, grokSite } from "./grok-adapter.js";
import type { WebChatSite } from "./web-chat.js";

afterEach(()=>vi.restoreAllMocks());
const providers = [{adapter:claudeAdapter,site:claudeSite},{adapter:mistralAdapter,site:mistralSite},{adapter:grokAdapter,site:grokSite}];
function fakePage(site:WebChatSite,opts:{login?:boolean;loadError?:boolean;generating?:boolean;working?:boolean;text?:string;sendReject?:boolean}={}) {
  let url = site.origin + "/" + site.conversationPaths[0] + "/fixture1234";
  let now=0;
  vi.spyOn(Date,"now").mockImplementation(()=>now);
  const sendClick=vi.fn().mockImplementation(()=>opts.sendReject?Promise.reject(new Error("uncertain")):Promise.resolve());
  const page:any={
    url:()=>url,
    goto:vi.fn(async(target:string)=>{url=target}),
    waitForTimeout:vi.fn(async(n:number)=>{now+=n}),
    locator:vi.fn((selector:string)=>({
      first:()=>({
        isVisible:vi.fn().mockResolvedValue(selector===site.login?!!opts.login:
          selector===site.loadError?!!opts.loadError:
          selector===site.stop?!!opts.generating:
          selector===site.working?!!opts.working:
          selector===site.editor?!opts.login:false),
        waitFor:vi.fn().mockResolvedValue(undefined),fill:vi.fn().mockResolvedValue(undefined),
        click:selector===site.send?sendClick:vi.fn().mockResolvedValue(undefined)
      }),
      count:vi.fn().mockResolvedValue(selector===site.assistant && opts.text ? 1:0),
      nth:()=>({innerText:vi.fn().mockResolvedValue(opts.text??"")})
    }))
  };
  return {page,sendClick};
}
describe.each(providers)("$site.id adapter behavior",({adapter,site})=>{
  it("reports a login gate rather than submitting",async()=>{
    const {page,sendClick}=fakePage(site,{login:true});
    const value:any=await adapter.execute("trigger",{prompt:"readonly"},{browser:{page},config:{adapterConfig:{}}});
    expect(value).toMatchObject({status:"unavailable",reason:"LOGIN_REQUIRED",provider:site.id});
    expect(sendClick).not.toHaveBeenCalled();
  });
  it("collects only a settled complete response from the exact conversation",async()=>{
    const {page}=fakePage(site,{text:"QUEQIAO_TEST_MARKER"});
    const value:any=await adapter.execute("collect",{conversationId:"fixture1234",conversationUrl:site.origin+"/"+site.conversationPaths[0]+"/fixture1234",timeoutMs:4000,settleMs:1000},{browser:{page},config:{adapterConfig:{}}});
    expect(value).toMatchObject({status:"completed",provider:site.id,conversationId:"fixture1234",text:"QUEQIAO_TEST_MARKER"});
  });
  it("returns transient errors without claiming completion",async()=>{
    const {page}=fakePage(site,{loadError:true,text:"old stale text"});
    const value:any=await adapter.execute("collect",{conversationId:"fixture1234",conversationUrl:site.origin+"/"+site.conversationPaths[0]+"/fixture1234",timeoutMs:1000,settleMs:1000},{browser:{page},config:{adapterConfig:{}}});
    expect(value).toMatchObject({status:"unavailable",reason:"TRANSIENT_LOAD_ERROR",retryable:true});
  });
  it("distinguishes timed-out generation from completed",async()=>{
    const {page}=fakePage(site,{generating:true,text:"unfinished"});
    const value:any=await adapter.execute("collect",{conversationId:"fixture1234",conversationUrl:site.origin+"/"+site.conversationPaths[0]+"/fixture1234",timeoutMs:1000,settleMs:1000},{browser:{page},config:{adapterConfig:{}}});
    expect(value).toMatchObject({status:"generating",partialText:"unfinished"});
  });
  it("does not claim completion while a provider tool-work indicator remains active",async()=>{
    const {page}=fakePage(site,{working:true,text:"partial before tool result"});
    if (!site.working) return;
    const value:any=await adapter.execute("collect",{conversationId:"fixture1234",conversationUrl:site.origin+"/"+site.conversationPaths[0]+"/fixture1234",timeoutMs:1000,settleMs:1000},{browser:{page},config:{adapterConfig:{}}});
    expect(value).toMatchObject({status:"generating",partialText:"partial before tool result"});
  });
  it("rejects a foreign conversation URL before navigation",async()=>{
    const {page}=fakePage(site);
    await expect(adapter.execute("collect",{conversationId:"fixture1234",conversationUrl:"https://attacker.invalid/chat/fixture1234"},{browser:{page},config:{adapterConfig:{}}})).rejects.toThrow(/identity mismatch/);
    expect(page.goto).not.toHaveBeenCalled();
  });
});
