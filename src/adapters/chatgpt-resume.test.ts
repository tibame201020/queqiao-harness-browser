import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileChatGptSend } from "./chatgpt-send.js";
const id="11111111-1111-4111-8111-111111111111";
const src="SYNTHETIC_RESUME_CONTENT_A_123456";
const norm=(s:string)=>s.replace(/\s+/g," ").trim();
function pageFixture({ firstAppearsAfter=0, wrong=false, duplicated=false, origin=false }={}) {
 let polls=0; const clicks:string[]=[];
 const before=2, now=()=>polls>=firstAppearsAfter?before+(duplicated?2:1):before;
 const user={locator:vi.fn((selector:string)=>({ count:vi.fn(async()=> selector===".whitespace-pre-wrap"?1:0),first:()=>({innerText:vi.fn(async()=>wrong?"FOREIGN_USER_TURN":src),locator:vi.fn(()=>({count:vi.fn(async()=>0)}))})})),getByRole:vi.fn(()=>({count:vi.fn(async()=>0)}))};
 const page={
  url:vi.fn(()=> origin?"https://foreign.invalid/c/"+id:"https://chatgpt.com/c/"+id),
  locator:vi.fn((selector:string)=>{
   if(selector==='[data-user-message-bubble="true"]')return {count:vi.fn(async()=>now()),nth:vi.fn(()=>user)};
   if(selector==='[data-message-author-role="user"]')return {count:vi.fn(async()=>0)};
   if(selector.includes("stop-button")||selector.includes("Stop generating")||selector.includes("停止產生")||selector.includes("停止生成")) return {first:()=>({isVisible:vi.fn(async()=>false)})};
   if(selector.includes('#prompt-textarea')||selector.includes('[role="textbox"]'))return {count:vi.fn(async()=>1),first:()=>({isVisible:vi.fn(async()=>true),isEditable:vi.fn(async()=>true),innerText:vi.fn(async()=>""),textContent:vi.fn(async()=>""),locator:vi.fn(()=>({count:vi.fn(async()=>0)}))})};
   if(selector.includes("send-button")||selector.includes('button[type="submit"]'))return {count:vi.fn(async()=>0)};
   throw Error("selector:"+selector);
  }),
  waitForTimeout:vi.fn(async()=>{polls++;}),
  keyboard:{insertText:vi.fn(async()=>clicks.push("type"))},
  goto:vi.fn(async()=>clicks.push("navigate")),
 };
 return {page,clicks,get polls(){return polls;}};
}
afterEach(()=>vi.restoreAllMocks());
describe("read-only resume of original ChatGPT Send (#30)",()=>{
 it("confirms exactly one late full-text-matching User Turn without a Send click",async()=>{
  let tick=0;vi.spyOn(Date,"now").mockImplementation(()=>{tick+=180;return tick;});
  const f=pageFixture({firstAppearsAfter:8});
  const result=await reconcileChatGptSend(f.page as never,src,id,{bubbles:2,legacy:0});
  expect(result).toBe(true);expect(f.clicks).toEqual([]);expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
 });
 it.each([{firstAppearsAfter:99},{wrong:true},{duplicated:true},{origin:true}])("never confirms absent, wrong, duplicated, or foreign turns (%o)",async flags=>{
  let tick=0;vi.spyOn(Date,"now").mockImplementation(()=>{tick+=850;return tick;});
  const f=pageFixture(flags);expect(await reconcileChatGptSend(f.page as never,src,id,{bubbles:2,legacy:0})).toBe(false);expect(f.clicks).toEqual([]);
 });
});
