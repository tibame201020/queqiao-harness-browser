import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";

const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const standard="https://chatgpt.com/c/"+A;
const project="https://chatgpt.com/g/g-p-synthetic-project/c/"+B;

describe("ChatGPT resolve_targets API (#37)",()=>{
  const resolve = (urls: string[]) => chatgptAdapter.execute("resolve_targets",{urls},{});
  it("converts browser URL candidates without reading or navigating any page",async()=>{
    expect(await resolve([standard,"https://example.invalid/",project,project])).toEqual({
      status:"complete",
      candidates:[
        {conversationId:A,conversationUrl:standard},
        {conversationId:B,conversationUrl:project},
      ],
    });
  });
  it("rejects ambiguity when two Project URL variants claim the same conversation id",async()=>{
    expect(await resolve([project,project.replace("g-p-synthetic-project","g-p-other")])).toMatchObject({
      status:"unresolved",reason:"CANDIDATE_IDENTITY_CONFLICT",
    });
  });
  it("rejects unrecognized URLs, attempts to exceed cap and invalid input",async()=>{
    expect(await resolve(["https://evil.invalid/c/"+A,standard+"?x=1"])).toMatchObject({
      status:"unresolved",reason:"NO_CANDIDATES",
    });
    const tooMany=Array.from({length:17},(_,i)=>
      "https://chatgpt.com/c/"+(i+1).toString(16).padStart(8,"0")+"-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(await resolve(tooMany)).toMatchObject({status:"unresolved",reason:"TOO_MANY_CANDIDATES"});
    await expect(resolve([])).rejects.toThrow();
  });
});