import { describe, expect, it, vi, afterEach } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";
import { reconcileOriginalProjectAttempt, sendChatGptPrompt } from "./chatgpt-send.js";

const uuid="11111111-1111-4111-8111-111111111111";
const canonical="https://chatgpt.com/g/g-p-alias/c/"+uuid;
vi.mock("./chatgpt-projects.js",async importOriginal=>{
  const original=await importOriginal<typeof import("./chatgpt-projects.js")>();
  return {...original, startProjectNewConversation:vi.fn(async()=>({projectId:"g-p-original"}))};
});
vi.mock("./chatgpt-send.js",async importOriginal=>{
  const original=await importOriginal<typeof import("./chatgpt-send.js")>();
  return {...original,
    sendChatGptPrompt:vi.fn(async(_page:unknown,_prompt:string,_expected:unknown,beforeClick:
      ((baseline:{bubbles:number;legacy:number})=>Promise<void>)|undefined)=>{
      await beforeClick?.({bubbles:0,legacy:0});
      throw new original.ChatGptSendError("DISPATCH_AMBIGUOUS",{url:canonical} as never);
    }),
    reconcileOriginalProjectAttempt:vi.fn(async()=>false),
  };
});
afterEach(()=>{vi.clearAllMocks();});
describe("Issue #60 original Project attempt immediate read-only recovery",()=>{
  const run=async(reconciles:boolean)=>{
    vi.mocked(reconcileOriginalProjectAttempt).mockResolvedValue(reconciles);
    const beforeSend=vi.fn(async()=>undefined);
    const result=await chatgptAdapter.execute("trigger",{prompt:"SYNTHETIC_ORIGINAL_CLICK"},{
      browser:{page:{url:()=>canonical}},
      config:{adapterConfig:{project:{enabled:true,name:"synthetic project"},conversation:{newChatEachRun:true}}},
      beforeSend,
    });
    return {result,beforeSend};
  };
  it("recovers submitted on the same canonical URL after live DOM ambiguity without resending",async()=>{
    const {result,beforeSend}=await run(true);
    expect(result).toMatchObject({status:"triggered",submissionState:"submitted",conversationId:uuid,url:canonical});
    expect(beforeSend).toHaveBeenCalledExactlyOnceWith("SYNTHETIC_ORIGINAL_CLICK",{
      conversationId:null,projectId:"g-p-original",baseline:{bubbles:0,legacy:0},
    });
    expect(sendChatGptPrompt).toHaveBeenCalledTimes(1);
    expect(reconcileOriginalProjectAttempt).toHaveBeenCalledWith(expect.anything(),
      "g-p-original","SYNTHETIC_ORIGINAL_CLICK",canonical);
  });
  it("leaves unknown for non-matching read-only reconciliation; Send still once",async()=>{
    const {result,beforeSend}=await run(false);
    expect(result).toMatchObject({status:"ambiguous",submissionState:"unknown",retryable:false});
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(sendChatGptPrompt).toHaveBeenCalledTimes(1);
  });
});