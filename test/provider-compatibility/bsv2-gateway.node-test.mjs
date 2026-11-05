import test from "node:test";
import { once } from "node:events";
import assert from "node:assert/strict";
import { makeBrowserPrompt, parseModelEnvelope, completionResponse, completionSse, createFixtureServer } from "../../scripts/bsv2-model-provider-feasibility.mjs";
const tools = [{type:"function",function:{name:"multiply_integers",description:"Multiply two integers",parameters:{type:"object",properties:{left:{type:"integer"},right:{type:"integer"}},required:["left","right"],additionalProperties:false}}},{type:"function",function:{name:"uppercase_text",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"],additionalProperties:false}}}];
const text = JSON.stringify({kind:"tool_calls",tool_calls:[{id:"call_synthetic_001",type:"function",function:{name:"multiply_integers",arguments:'{"left":17,"right":23}'}}]});
test("protocol prompt preserves system/user/tool history and supplied tool schema",()=>{const p=makeBrowserPrompt({model:"browser-chatgpt",messages:[{role:"system",content:"do not guess"},{role:"user",content:"multiply 17 and 23"},{role:"tool",tool_call_id:"call_previous",content:"391"}],tools});assert.match(p,/do not guess/);assert.match(p,/multiply_integers/);assert.match(p,/call_previous/);});
test("structured model-originated JSON parsed to tool call, reject prose & illegal calls",()=>{const v=parseModelEnvelope(text,tools);assert.equal(v.tool_calls[0].function.name,"multiply_integers");assert.deepEqual(JSON.parse(v.tool_calls[0].function.arguments),{left:17,right:23});assert.throws(()=>parseModelEnvelope("Please call multiply_integers",tools),/JSON|structured/i);assert.throws(()=>parseModelEnvelope('{"kind":"tool_calls","tool_calls":[{"id":"call_bad","type":"function","function":{"name":"delete_all","arguments":"{}"}}]}',tools),/tool|allow/i);assert.throws(()=>parseModelEnvelope('{"kind":"tool_calls","tool_calls":[{"id":"call_bad","type":"function","function":{"name":"multiply_integers","arguments":"{\\"left\\":17,\\"right\\":\\"wrong\\"}"}}]}',tools),/schema|argument|type|JSON/i);});
test("standard response and stream preserve function call ID, args and stop reason",()=>{const v=parseModelEnvelope(text,tools);const r=completionResponse("browser-chatgpt",v,{id:"chatcmpl_test",created:1730000000});assert.equal(r.object,"chat.completion");assert.equal(r.choices[0].finish_reason,"tool_calls");assert.equal(r.choices[0].message.content,null);assert.equal("usage" in r,false);const s=completionSse("browser-chatgpt",v,{id:"chatcmpl_test",created:1730000000});assert.ok(s.endsWith("data: [DONE]\n\n"));const events=s.split("\n\n").filter(x=>x.startsWith("data: {")).map(x=>JSON.parse(x.slice(6)));assert.equal(events.at(-1).choices[0].finish_reason,"tool_calls");const d=events.find(x=>x.choices[0].delta.tool_calls)?.choices[0].delta.tool_calls[0];assert.equal(d.index,0);assert.equal(d.id,"call_synthetic_001");assert.equal(d.function.name,"multiply_integers");});
test("after role:tool result, correct final text response is possible; required cannot be ignored",()=>{const p=makeBrowserPrompt({model:"browser-chatgpt",messages:[{role:"assistant",content:null,tool_calls:JSON.parse(text).tool_calls},{role:"tool",tool_call_id:"call_synthetic_001",content:"391"}],tools});assert.match(p,/call_synthetic_001/);assert.match(p,/391/);const v=parseModelEnvelope('{"kind":"final","content":"Result is 391."}',tools);assert.equal(completionResponse("browser-chatgpt",v,{id:"c2",created:1730000000}).choices[0].finish_reason,"stop");assert.throws(()=>parseModelEnvelope('{"kind":"final","content":"oops"}',tools,"required"),/required/i);});

test("completed HTTP POST must respond even after request body stream is closed", async () => {
  const server = createFixtureServer({port: 0, ask: async () => ({kind:"final", content:"BSV2_HTTP_OK"})});
  try {
    await once(server,"listening");
    const url = "http://127.0.0.1:"+server.address().port+"/v1/chat/completions";
    const r = await fetch(url,{method:"POST",headers:{"Authorization":"Bearer bsv2-synthetic-test-only","Content-Type":"application/json"},body:JSON.stringify({model:"browser-chatgpt",messages:[{role:"user",content:"synthetic"}],stream:true}),signal:AbortSignal.timeout(2000)});
    assert.equal(r.status,200);
    assert.match(await r.text(),/BSV2_HTTP_OK/);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});

test("an uncertain Browser model failure quarantines the fixture against automatic HTTP retry", async () => {
  let calls = 0;
  const server = createFixtureServer({port:0,ask:async()=>{calls++;throw Error("synthetic uncertain Send");}});
  try {
    await once(server,"listening");
    const url="http://127.0.0.1:"+server.address().port+"/v1/chat/completions";
    const request=()=>fetch(url,{method:"POST",headers:{"Authorization":"Bearer bsv2-synthetic-test-only","Content-Type":"application/json"},body:JSON.stringify({model:"browser-chatgpt",messages:[{role:"user",content:"fixture"}]}),signal:AbortSignal.timeout(2500)});
    assert.equal((await request()).status,502);
    assert.equal((await request()).status,409);
    assert.equal(calls,1,"the same uncertain Browser backend must never be called again");
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
