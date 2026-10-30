import { describe, expect, it, vi } from "vitest";
import { reconcileOriginalProjectAttempt } from "./chatgpt-send.js";
import { chatgptAdapter } from "./chatgpt-adapter.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const url = "https://chatgpt.com/g/g-p-routealias/c/" + uuid;
const prompt = "ISSUE60_SYNTHETIC_ORIGINAL_PROJECT_ATTEMPT_MATCH_123456";
function fixture(opts: { savedTurns?:number; wrongText?:boolean; missingMembership?:boolean; wrongMembership?:boolean; wrongSavedUrl?:boolean; savedRouteAlias?:boolean; delayedCounts?:number[] } = {}) {
  const opens:string[] = []; const sends:string[] = [];
  const memberPage = {
    url: vi.fn(() => "https://chatgpt.com/g/g-p-original/project"),
    goto: vi.fn(async (target:string) => { opens.push("membership:"+target); }),
    locator: vi.fn(() => ({
      first: vi.fn(() => ({
        waitFor: vi.fn(async () => { if (opts.missingMembership) throw Error("missing"); }),
        getAttribute: vi.fn(async () => opts.wrongMembership
          ? "/g/g-p-routealias/c/22222222-2222-4222-8222-222222222222"
          : "/g/g-p-routealias/c/"+uuid),
      })),
      count: vi.fn(async () => opts.missingMembership ? 0 : 1),
    })),
    close: vi.fn(async () => undefined),
  };
  let savedLocation = url;
  let polls = 0;
  const root = { innerText: vi.fn(async () => opts.wrongText ? "OTHER_SAVED_USER_INPUT" : prompt) };
  const user = {locator: vi.fn(() => ({
    count: vi.fn(async () => 1),
    first: vi.fn(() => root),
  }))};
  const turns = {
    first: vi.fn(() => ({
      waitFor: vi.fn(async () => undefined),
      locator: user.locator,
    })),
    count: vi.fn(async () => opts.delayedCounts
      ? opts.delayedCounts[Math.min(polls,opts.delayedCounts.length-1)]
      : (opts.savedTurns ?? 1)),
  };
  const savedPage = {
    url: vi.fn(() => savedLocation),
    goto: vi.fn(async (target:string) => {
      opens.push("saved:"+target);
      savedLocation = opts.wrongSavedUrl ? "https://chatgpt.com/c/"+uuid
        : opts.savedRouteAlias ? "https://chatgpt.com/g/g-p-site-alias/c/"+uuid : target;
    }),
    locator: vi.fn(() => turns),
    waitForTimeout: vi.fn(async () => { polls++; }),
    close: vi.fn(async () => undefined),
  };
  let next = 0;
  const livePage = {
    context: vi.fn(() => ({
      newPage: vi.fn(async () => {next++;return next === 1 ? memberPage : savedPage;}),
    })),
    // The live original first-Send DOM remains ambiguous 0→2→1→2.
    locator: vi.fn(() => {throw Error("live transient DOM is not proof of saved state");}),
    keyboard:{insertText:vi.fn(async () => sends.push("SEND"))},
  };
  return {livePage,opens,sends,savedPage,memberPage,get polls(){return polls;}};
}
describe("Issue #60: original first Project Send read-only reconciliation",()=>{
  it("accepts the original observed saved Conversation on stable unique full text despite unrelated live DOM",async()=>{
    const f=fixture();
    expect(await reconcileOriginalProjectAttempt(f.livePage as never,"g-p-original",prompt,url)).toBe(true);
    expect(f.opens).toContain("saved:"+url);
    expect(f.opens).toContain("membership:https://chatgpt.com/g/g-p-original/project");
    expect(f.sends).toEqual([]);
    expect(f.polls).toBe(1);
  });
  it("converts the same original persisted Project Attempt to submitted using existing resume action",async()=>{
    const f=fixture();
    const result=await chatgptAdapter.execute("resume",{
      projectId:"g-p-original",conversationUrl:url,prompt,baseline:{bubbles:0,legacy:0},
    },{browser:{page:f.livePage}});
    expect(result).toMatchObject({status:"submitted",submissionState:"submitted",conversationId:uuid,url});
    expect(f.sends).toEqual([]);
  });
  it.each([
    {savedTurns:2},
    {wrongText:true},
    {missingMembership:true},
    {wrongMembership:true},
    {wrongSavedUrl:true},
  ])("retains UNKNOWN without trying to Send for a non-owned saved Conversation: %j",async flags=>{
    const f=fixture(flags);
    expect(await reconcileOriginalProjectAttempt(f.livePage as never,"g-p-original",prompt,url)).toBe(false);
    expect(f.sends).toEqual([]);
  });
  it("reconciles delayed 0→0→2→1 server hydration without looking at the transient live tab",async()=>{
    const f=fixture({delayedCounts:[0,0,2,2,1,1,1,1]});
    expect(await reconcileOriginalProjectAttempt(f.livePage as never,"g-p-original",prompt,url)).toBe(true);
    expect(f.sends).toHaveLength(0);
    expect(f.polls).toBeGreaterThanOrEqual(5);
  });
  it("Issue #60 route alias: accepts identical saved Conversation UUID under a canonical Project route alias",async()=>{
    const f=fixture({savedRouteAlias:true,delayedCounts:[0,0,1,1]});
    expect(await reconcileOriginalProjectAttempt(f.livePage as never,"g-p-original",prompt,url)).toBe(true);
    expect(f.sends).toEqual([]);
  });
  it("rejects an invented or provisional destination without opening a browser tab",async()=>{
    const f=fixture();
    expect(await reconcileOriginalProjectAttempt(f.livePage as never,"g-p-original",prompt,
      "https://chatgpt.com/g/g-p-routealias/c/local-chatgpt%3A"+uuid)).toBe(false);
    expect(f.livePage.context).not.toHaveBeenCalled();
  });
});
