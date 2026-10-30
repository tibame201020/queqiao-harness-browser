import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";

const id="11111111-1111-4111-8111-111111111111";
const savedUrl="https://chatgpt.com/g/g-p-original/c/"+id;
const prompt="ISSUE63_SYNTHETIC_FIFTH_ORIGINAL_ATTEMPT_INPUT";
type Opt={wrongText?:boolean; wrongId?:boolean; foreignOrigin?:boolean; persistedCount?:number; duplicateMatching?:boolean; neverSettles?:boolean};
function fixture(opt:Opt={}){
  let mainPoll=0, savedPoll=0;
  const actions:string[]=[];
  const stored = Array.from({length:5},(_,i)=>i===4?prompt:"PREVIOUS_UNIQUE_SYNTHETIC_USER_"+i);
  if(opt.wrongText) stored[4]="INCORRECT_SUBMITTED_INPUT";
  if(opt.duplicateMatching) stored[1]=prompt;
  let probeUrl=savedUrl;
  const content=(i:number)=>({
    locator:vi.fn((selector:string)=>{
      if(selector.includes(".whitespace-pre-wrap"))return {
        count:vi.fn(async()=>1),first:()=>({innerText:vi.fn(async()=>stored[i])})
      };
      throw Error("Unexpected saved selector: "+selector);
    }),
    getByRole:vi.fn(()=>({count:vi.fn(async()=>0)})),
  });
  const probe={
    goto:vi.fn(async(raw:string)=>{actions.push("READ_ONLY_NAVIGATION");probeUrl=opt.foreignOrigin?"https://elsewhere.invalid/c/"+id:opt.wrongId?"https://chatgpt.com/c/22222222-2222-4222-8222-222222222222":raw;return {status:()=>200};}),
    url:vi.fn(()=>probeUrl),
    locator:vi.fn((selector:string)=>{
      if(selector==='[data-user-message-bubble="true"]'){
        const count=()=>opt.neverSettles?10:opt.persistedCount??([0,10,5,5,5][Math.min(savedPoll,4)]);
        return {count:vi.fn(async()=>count()),first:vi.fn(()=>content(0)),nth:vi.fn((i:number)=>content(i))};
      }
      if(selector==='[data-message-author-role="user"]')return {count:vi.fn(async()=>0)};
      throw Error("Unexpected saved probe selector: "+selector);
    }),
    waitForTimeout:vi.fn(async()=>{savedPoll++;}),
    close:vi.fn(async()=>undefined),
  };
  const original={
    url:vi.fn(()=>savedUrl),
    goto:vi.fn(async()=>({status:()=>200})),
    title:vi.fn(async()=>"ChatGPT"),
    context:vi.fn(()=>({newPage:vi.fn(async()=>probe)})),
    locator:vi.fn((selector:string)=>{
      if(selector==='[data-user-message-bubble="true"]')return {
        count:vi.fn(async()=>mainPoll===0?0:10),nth:vi.fn(()=>content(4)),
      };
      if(selector==='[data-message-author-role="user"]')return {count:vi.fn(async()=>0)};
      if(selector.includes("stop-button")||selector.includes("Stop generating")||selector.includes("停止產生")||selector.includes("停止生成"))return {first:()=>({isVisible:vi.fn(async()=>false)})};
      if(selector.includes('#prompt-textarea')||selector.includes('[role="textbox"]'))return {count:vi.fn(async()=>1),first:()=>({isVisible:vi.fn(async()=>true),isEditable:vi.fn(async()=>true),innerText:vi.fn(async()=>""),textContent:vi.fn(async()=>""),locator:vi.fn(()=>({count:vi.fn(async()=>0)}))})};
      if(selector.includes("send-button")||selector.includes('button[type="submit"]'))return {count:vi.fn(async()=>0)};
      throw Error("Unexpected main locator: "+selector);
    }),
    waitForTimeout:vi.fn(async()=>{mainPoll++;}),
    keyboard:{insertText:vi.fn(async()=>actions.push("SEND"))},
  };
  return {original,probe,actions,get mainPoll(){return mainPoll;},get savedPoll(){return savedPoll;}};
}
afterEach(()=>vi.restoreAllMocks());
describe("Issue #63 same-saved-Conversation fifth continuation",()=>{
  async function resume(opt:Opt={}){
    let clock=0;vi.spyOn(Date,"now").mockImplementation(()=>{clock+=800;return clock;});
    const f=fixture(opt);
    const result=await chatgptAdapter.execute("resume",{
      conversationId:id,prompt,baseline:{bubbles:4,legacy:0},
    },{browser:{page:f.original}});
    return {f,result};
  }
  it("RED: reconciles 4→4 original and 0→10 UI hydration against independently saved five unique Users",async()=>{
    const {f,result}=await resume();
    expect(result).toMatchObject({status:"submitted",submissionState:"submitted",conversationId:id});
    expect(f.actions).toEqual(["READ_ONLY_NAVIGATION"]);
    expect(f.probe.close).toHaveBeenCalledOnce();
    expect(f.original.keyboard.insertText).not.toHaveBeenCalled();
  });
  it.each([
    {wrongText:true},{wrongId:true},{foreignOrigin:true},{persistedCount:6},
    {duplicateMatching:true},{neverSettles:true},
  ])("does not submit wrong, foreign, duplicate or unsettled persisted transcript: %j",async options=>{
    const {f,result}=await resume(options);
    expect(result).toMatchObject({status:"pending",submissionState:"unknown",retryable:false});
    expect(f.original.keyboard.insertText).not.toHaveBeenCalled();
  });
});