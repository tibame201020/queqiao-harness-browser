import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileChatGptSend } from "./chatgpt-send.js";
import { chatgptAdapter } from "./chatgpt-adapter.js";
const cid="11111111-1111-4111-8111-111111111111";
const url="https://chatgpt.com/g/g-p-fixture/c/"+cid;
const id=(n:number)=>String(n).padStart(8,"0")+"-1111-4111-8111-111111111111";
const source="ISSUE63_SYNTHETIC_ORIGINAL_ATTEMPT_CONTENT";
const baselineIds=[id(1),id(2),id(3),id(4)];
function fixture({persistedIds=[id(1),id(2),id(3),id(9)],texts=["OLD A","OLD B","OLD C",source],foreign=false}:
 {persistedIds?:string[],texts?:string[],foreign?:boolean}={}){
 let tick=0;
 const root=(t:string)=>({count:vi.fn(async()=>1),first:()=>({innerText:vi.fn(async()=>t)})});
 const user=(index:number)=>({locator:vi.fn((sel:string)=>sel.includes(".whitespace-pre-wrap")?root(texts[index]):{count:vi.fn(async()=>0)}),
  getByRole:vi.fn(()=>({count:vi.fn(async()=>0)}))});
 const saved={url:vi.fn(()=>foreign?"https://foreign.invalid/c/"+cid:url),
   goto:vi.fn(async()=>({status:()=>200})),close:vi.fn(async()=>undefined),
   waitForTimeout:vi.fn(async()=>{}),
   locator:vi.fn((sel:string)=>sel==='[data-user-message-bubble="true"]'?
    {count:vi.fn(async()=>persistedIds.length),evaluateAll:vi.fn(async()=>persistedIds),nth:vi.fn((i:number)=>user(i))}:
    {count:vi.fn(async()=>0)})};
 const editor={innerText:vi.fn(async()=>""),textContent:vi.fn(async()=>""),isVisible:vi.fn(async()=>true),isEditable:vi.fn(async()=>true),locator:vi.fn(()=>({count:vi.fn(async()=>0)}))};
 const main={url:vi.fn(()=>url),goto:vi.fn(async()=>({status:()=>200})),title:vi.fn(async()=>"ChatGPT"),waitForTimeout:vi.fn(async()=>{}),context:vi.fn(()=>({newPage:vi.fn(async()=>saved)})),keyboard:{insertText:vi.fn(async()=>{throw Error("Resume must never send")})},
   locator:vi.fn((sel:string)=>{
    if(sel==='[data-user-message-bubble="true"]')return {count:vi.fn(async()=>4),nth:vi.fn((i:number)=>user(i))};
    if(sel==='[data-message-author-role="user"]')return {count:vi.fn(async()=>0)};
    if(sel.includes("stop-button")||sel.includes("Stop generating")||sel.includes("停止產生")||sel.includes("停止生成"))return {first:()=>({isVisible:vi.fn(async()=>false)})};
    if(sel.includes("prompt-textarea")||sel.includes("textbox"))return {count:vi.fn(async()=>1),first:()=>editor};
    if(sel.includes("send-button")||sel.includes('button[type="submit"]'))return {count:vi.fn(async()=>0)};
    throw Error("Unexpected selector "+sel);
   })};
 vi.spyOn(Date,"now").mockImplementation(()=>{tick+=900;return tick;});
 return {main,saved};
}
afterEach(()=>vi.restoreAllMocks());
describe("Issue 63 persistent User message identity, never round numbers",()=>{
 it("RED: verifies one NEW saved original message ID despite same 4→4 DOM bubble count",async()=>{
  const f=fixture();expect(await reconcileChatGptSend(f.main as never,source,cid,
    {bubbles:4,legacy:0,messageIds:baselineIds})).toBe(true);
  expect(f.saved.goto).toHaveBeenCalledOnce();expect(f.main.keyboard.insertText).not.toHaveBeenCalled();
 });
 it("RED: read-only Resume navigates the original saved Project URL rather than a guessed generic route",async()=>{
  const f=fixture();
  const result=await chatgptAdapter.execute("resume",{conversationId:cid,observedUrl:url,prompt:source,baseline:{bubbles:999,legacy:0,messageIds:baselineIds}},{browser:{page:f.main}});
  expect(f.main.goto).toHaveBeenCalledWith(url,expect.anything());
  expect(result).toMatchObject({status:"submitted",submissionState:"submitted",conversationId:cid,url});
  expect(f.main.keyboard.insertText).not.toHaveBeenCalled();
 });
 it("rejects a matching last message with an OLD persisted message ID",async()=>{
  const f=fixture({persistedIds:baselineIds});
  expect(await reconcileChatGptSend(f.main as never,source,cid,
    {bubbles:4,legacy:0,messageIds:baselineIds})).toBe(false);
 });
 it("rejects unknown original text even if the saved message ID is new",async()=>{
  const f=fixture({texts:["OLD A","OLD B","OLD C","FOREIGN"]});
  expect(await reconcileChatGptSend(f.main as never,source,cid,
    {bubbles:4,legacy:0,messageIds:baselineIds})).toBe(false);
 });
 it("rejects foreign origin and duplicate saved identical originals",async()=>{
  const f=fixture({foreign:true});
  expect(await reconcileChatGptSend(f.main as never,source,cid,
    {bubbles:4,legacy:0,messageIds:baselineIds})).toBe(false);
  vi.restoreAllMocks();
  const g=fixture({persistedIds:[id(1),id(2),id(8),id(9)],texts:["OLD A","OLD B",source,source]});
  expect(await reconcileChatGptSend(g.main as never,source,cid,
    {bubbles:4,legacy:0,messageIds:baselineIds})).toBe(false);
 });
});
