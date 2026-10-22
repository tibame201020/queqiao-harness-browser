import {expect,it,vi} from "vitest";
import {grokAdapter,grokSite} from "./grok-adapter.js";
it("reports Cloudflare security verification as SITE_CHALLENGE, never pending or completed",async()=>{
 const page:any={
   url:()=>grokSite.origin+"/",
   locator:vi.fn((selector:string)=>({
     first:()=>({isVisible:vi.fn().mockResolvedValue(false)}),
     innerText:vi.fn().mockResolvedValue(selector==="body"?"grok.com 正在執行安全驗證 Cloudflare":"")
   }))
 };
 const value:any=await grokAdapter.execute("status",{},{browser:{page},config:{adapterConfig:{}}});
 expect(value).toMatchObject({status:"unavailable",reason:"SITE_CHALLENGE",retryable:false,provider:"grok"});
});
