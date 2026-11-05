import {afterEach,describe,expect,it,vi} from "vitest";
import {grokAdapter,grokSite} from "./grok-adapter.js";
import {mistralAdapter,mistralSite} from "./mistral-adapter.js";
import type {WebChatSite} from "./web-chat.js";

afterEach(()=>vi.restoreAllMocks());

function fixture(site:WebChatSite, options:{duplicate?:boolean; editable?:boolean; sendCount?:number}={}) {
  let now=0;
  let url=site.newChatUrl;
  vi.spyOn(Date,"now").mockImplementation(()=>now);
  const sendClick=vi.fn(async()=>{url=site.origin+"/"+site.conversationPaths[0]+"/fixture1234";});
  const send={count:vi.fn(async()=>options.sendCount??1),waitFor:vi.fn(async()=>{}),click:sendClick};
  const form={count:vi.fn(async()=>1),locator:vi.fn(()=>send)};
  const fill=vi.fn(async()=>{});
  const editor={
    count:vi.fn(async()=>options.duplicate?2:1),
    first(){return this;},isVisible:vi.fn(async()=>true),
    evaluate:vi.fn(async()=>options.editable??true),
    locator:vi.fn(()=>form),waitFor:vi.fn(async()=>{}),fill,
  };
  const absentRole={count:vi.fn(async()=>0)};
  const cssEditor={count:vi.fn(async()=>0),first(){return {isVisible:vi.fn(async()=>false)}}};
  const hidden={first(){return {isVisible:vi.fn(async()=>false)}},count:vi.fn(async()=>0)};
  const page={
    url:()=>url, goto:vi.fn(async(target:string)=>{url=target}),
    waitForTimeout:vi.fn(async(n:number)=>{now+=n}),
    getByRole:vi.fn((role:string)=>role===site.semanticEditor?.roles[0]?editor:absentRole),
    locator:vi.fn((selector:string)=>selector===site.editor?cssEditor:hidden)
  };
  return {page,sendClick,fill,form,send};
}

describe.each([
  {site:grokSite,adapter:grokAdapter},
  {site:mistralSite,adapter:mistralAdapter},
])("$site.id native Accessibility Browser recovery",({site,adapter})=>{
  it("uses the recovered unique form-owned Send exactly once",async()=>{
    const f=fixture(site);
    const r=await adapter.execute("trigger",{prompt:"TEST_FIXTURE"},{browser:{page:f.page as never},config:{adapterConfig:{}}});
    expect(r).toMatchObject({status:"triggered",provider:site.id,conversationId:"fixture1234"});
    expect(f.fill).toHaveBeenCalledExactlyOnceWith("TEST_FIXTURE");
    expect(f.sendClick).toHaveBeenCalledTimes(1);
    expect(f.form.locator).toHaveBeenCalledWith(site.semanticEditor?.sendWithinForm);
  });
  it.each([
    ["ambiguous editor",{duplicate:true}],
    ["noneditable editor",{editable:false}],
    ["ambiguous Send",{sendCount:2}],
  ] as const)("never sends when %s",async(_name,options)=>{
    const f=fixture(site,options);
    const r=await adapter.execute("trigger",{prompt:"TEST_FIXTURE"},{browser:{page:f.page as never},config:{adapterConfig:{}}});
    expect(r).toMatchObject({status:"unavailable",reason:"COMPOSER_NOT_FOUND"});
    expect(f.fill).not.toHaveBeenCalled();
    expect(f.sendClick).not.toHaveBeenCalled();
  });
});
