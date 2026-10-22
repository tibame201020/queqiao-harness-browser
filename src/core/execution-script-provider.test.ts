import {describe,expect,it} from "vitest";
import {compileExecutionScript,ExecutionScriptError} from "./execution-script.js";
const adapters=["claude","mistral","grok"] as const;
describe.each(adapters)("execution script for %s",provider=>{
 it("selects independent provider profile and readonly trigger",()=>{
   const result=compileExecutionScript({version:"1",execution:{mode:"once"},task:{adapter:provider,action:"trigger",target:{conversation:{mode:"new"}},input:{prompt:"Use Queqiao read_file"}}});
   expect(result.executionId).toBe("script-"+provider+"-default");
   expect(result.config.adapter).toBe(provider);
   expect(result.config.browser.headless).toBe(false);
   expect(result.config.adapterConfig).toMatchObject({trigger:{prompt:"Use Queqiao read_file"},connector:{strategy:"preconnected"}});
 });
 it("supports collect with explicit immutable conversation identity",()=>{
   const result=compileExecutionScript({version:"1",execution:{mode:"once"},task:{adapter:provider,action:"collect",input:{conversationId:"fixture1234",conversationUrl:"https://example.com/chat/fixture1234"}}});
   expect(result.action).toBe("collect");
   expect(result.args).toMatchObject({conversationId:"fixture1234"});
 });
 it("rejects Project retention and unsupported reuse rather than silently degrading",()=>{
   expect(()=>compileExecutionScript({version:"1",execution:{mode:"once"},task:{adapter:provider,action:"trigger",retention:{maxConversations:10},input:{prompt:"test"}}})).toThrow(ExecutionScriptError);
   expect(()=>compileExecutionScript({version:"1",execution:{mode:"once"},task:{adapter:provider,action:"trigger",target:{conversation:{mode:"reuse",id:"other"}},input:{prompt:"test"}}})).toThrow(ExecutionScriptError);
 });
 it("compiles status action",()=>{
   expect(compileExecutionScript({version:"1",execution:{mode:"once"},task:{adapter:provider,action:"status",input:{}}}).action).toBe("status");
 });
});
