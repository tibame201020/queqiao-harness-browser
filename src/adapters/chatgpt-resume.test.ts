import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileChatGptSend } from "./chatgpt-send.js";
import { chatgptAdapter } from "./chatgpt-adapter.js";

it("classifies HTTP 403 during read-only Resume as unavailable and keeps the original Send unknown (#32)", async () => {
  const page = {
    url: vi.fn(() => "https://chatgpt.com/c/11111111-1111-4111-8111-111111111111"),
    goto: vi.fn(async () => ({ status: () => 403 })),
    locator: vi.fn(() => { throw new Error("403 page must not enter User Turn reconciliation"); }),
  };
  const result = await chatgptAdapter.execute("resume", {
    conversationId: "11111111-1111-4111-8111-111111111111",
    prompt: "SYNTHETIC_RESUME_CONTENT_A_123456",
    baseline: { bubbles: 2, legacy: 0 },
  }, { browser: { page } });
  expect(result).toMatchObject({
    status: "unavailable", submissionState: "unknown",
    reason: "NAVIGATION_HTTP_ERROR", httpStatus: 403,
    retryable: false, canResume: false,
  });
  expect(page.goto).toHaveBeenCalledTimes(1);
  expect(page.locator).not.toHaveBeenCalled();
});

it("classifies failed Resume navigation as unavailable while preserving unknown Send (#32)", async () => {
  const page = {
    url: vi.fn(() => "https://chatgpt.com/c/11111111-1111-4111-8111-111111111111"),
    goto: vi.fn(async () => { throw new Error("synthetic navigation failure"); }),
  };
  const result = await chatgptAdapter.execute("resume", {
    conversationId: "11111111-1111-4111-8111-111111111111",
    prompt: "SYNTHETIC_RESUME_CONTENT_A_123456",
    baseline: { bubbles: 2, legacy: 0 },
  }, { browser: { page } });
  expect(result).toMatchObject({
    status: "unavailable", submissionState: "unknown", reason: "NAVIGATION_FAILED",
    retryable: false, canResume: false,
  });
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_RESUME_CONTENT_A_123456");
});

it("recognizes a redirected HTTP 200 challenge before saved Conversation identity checks (#32)", async () => {
  const page = {
    url: vi.fn(() => "https://chatgpt.com/cdn-cgi/challenge-platform"),
    goto: vi.fn(async () => ({ status: () => 200 })),
    title: vi.fn(async () => "Just a moment..."),
  };
  const result = await chatgptAdapter.execute("resume", {
    conversationId: "11111111-1111-4111-8111-111111111111",
    prompt: "SYNTHETIC_RESUME_CONTENT_A_123456",
    baseline: { bubbles: 2, legacy: 0 },
  }, { browser: { page } });
  expect(result).toMatchObject({
    status: "unavailable", submissionState: "unknown", reason: "SITE_CHALLENGE",
    retryable: false, canResume: false,
  });
});

it("classifies an HTTP 200 security challenge as unavailable without attempting Send proof (#32)", async () => {
  const page = {
    url: vi.fn(() => "https://chatgpt.com/c/11111111-1111-4111-8111-111111111111"),
    goto: vi.fn(async () => ({ status: () => 200 })),
    title: vi.fn(async () => "請稍候..."),
    locator: vi.fn(() => { throw new Error("Challenge page has no conversation turns"); }),
  };
  const result = await chatgptAdapter.execute("resume", {
    conversationId: "11111111-1111-4111-8111-111111111111",
    prompt: "SYNTHETIC_RESUME_CONTENT_A_123456",
    baseline: { bubbles: 2, legacy: 0 },
  }, { browser: { page } });
  expect(result).toMatchObject({
    status: "unavailable", submissionState: "unknown", reason: "SITE_CHALLENGE",
    retryable: false, canResume: false,
  });
  expect(page.locator).not.toHaveBeenCalled();
});

const id="11111111-1111-4111-8111-111111111111";
const src="SYNTHETIC_RESUME_CONTENT_A_123456";
const norm=(s:string)=>s.replace(/\s+/g," ").trim();
function pageFixture({ firstAppearsAfter=0, wrong=false, duplicated=false, origin=false, mutateSameCountAfter=-1 }={}) {
 let polls=0; const clicks:string[]=[];
 const before=2, now=()=>polls>=firstAppearsAfter?before+(duplicated?2:1):before;
 const user={locator:vi.fn((selector:string)=>({ count:vi.fn(async()=> selector===".whitespace-pre-wrap"?1:0),first:()=>({innerText:vi.fn(async()=>wrong?"FOREIGN_USER_TURN":mutateSameCountAfter>=0 && polls<mutateSameCountAfter?"OLDER_SYNTHETIC_TURN":src),locator:vi.fn(()=>({count:vi.fn(async()=>0)}))})})),getByRole:vi.fn(()=>({count:vi.fn(async()=>0)}))};
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
  goto:vi.fn(async()=>({status:()=>200})),
  title:vi.fn(async()=>"ChatGPT"),
 };
 return {page,clicks,get polls(){return polls;}};
}
afterEach(()=>vi.restoreAllMocks());
describe("read-only resume of original ChatGPT Send (#30)",()=>{
 it("keeps a normal HTTP 200 conversation with no new User Turn pending, not unavailable (#32)",async()=>{
  let tick=0; vi.spyOn(Date,"now").mockImplementation(()=>{tick+=850;return tick;});
  const f=pageFixture({firstAppearsAfter:99});
  const result=await chatgptAdapter.execute("resume",{
   conversationId:id,prompt:src,baseline:{bubbles:2,legacy:0},
  },{browser:{page:f.page}});
  expect(result).toMatchObject({
   status:"pending",submissionState:"unknown",retryable:false,canResume:true,
  });
  expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
  expect(result).toMatchObject({
   diagnostic: { turnEvidence: {
    before: { bubbles:2, legacy:0 }, current: { bubbles:2, legacy:0 },
    sameCountLastMatchesOriginal: true, observedNewTurn: false,
   } },
  });
 });

 it("reports count-preserving last-turn replacement without declaring an original Send confirmed (#32)",async()=>{
  let tick=0; vi.spyOn(Date,"now").mockImplementation(()=>{tick+=600;return tick;});
  const f=pageFixture({firstAppearsAfter:99,mutateSameCountAfter:2});
  const result=await chatgptAdapter.execute("resume",{
   conversationId:id,prompt:src,baseline:{bubbles:2,legacy:0},
  },{browser:{page:f.page}});
  expect(result).toMatchObject({
   status:"pending", submissionState:"unknown", retryable:false,
   diagnostic:{turnEvidence:{
    observedNewTurn:false, sameCountLastMatchesOriginal:true, sameCountLastChanged:true,
   }},
  });
  expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
 });
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
