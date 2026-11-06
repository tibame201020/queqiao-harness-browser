import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createChatGptTool} from './chatgpt-core.mjs';

const profile='synthetic-pi-orca';
const id='11111111-1111-4111-8111-111111111111';
const url='https://chatgpt.com/c/'+id;
const submitted={status:'submitted',conversationId:id,conversationUrl:url};
const completed={status:'completed',conversationId:id,conversationUrl:url,text:'Synthetic acknowledgment'};
const sha=t=>createHash('sha256').update(t).digest('hex');
async function setup({ready=true,trigger=async()=>submitted,collect=async()=>completed,recover}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-orca-core-test-'));
 const calls=[];
 const transport={
  readiness:async()=>{calls.push({method:'readiness'});return typeof ready==='function'?ready():ready},
  trigger:async args=>{calls.push({method:'trigger',args});return trigger(args)},
  collect:async args=>{calls.push({method:'collect',args});return collect(args)},
  ...(recover?{recover:async args=>{calls.push({method:'recover',args});return recover(args)}}:{})
 };
 const tool=createChatGptTool({profile,stateDir:dir,transport});
 return {tool,calls,dir,cleanup:()=>fs.rm(dir,{recursive:true,force:true})};
}
const count=(calls,method)=>calls.filter(x=>x.method===method).length;

test('ask completes with verified original conversation URL, repeat never resends, journal omits prompt',async()=>{
 const x=await setup();try{
  const a=await x.tool.ask({question:'Synthetic bounded question',request_id:'test-one-1234'});
  assert.equal(a.status,'COMPLETED');assert.equal(a.answer,'Synthetic acknowledgment');assert.equal(a.conversation_url,url);
  assert.equal((await x.tool.ask({question:'Synthetic bounded question',request_id:'test-one-1234'})).status,'COMPLETED');
  assert.equal(count(x.calls,'trigger'),1);assert.equal(count(x.calls,'collect'),1);
  const files=await fs.readdir(x.dir);assert.equal(files.length,1);
  assert.equal((await fs.readFile(path.join(x.dir,files[0]),'utf8')).includes('Synthetic bounded question'),false);
 }finally{await x.cleanup()}
});
test('ambiguous Orca send is durably UNKNOWN and never blindly resent',async()=>{
 const x=await setup({trigger:async()=>({status:'unknown',reason:'POST_CLICK_UNVERIFIED'})});try{
  assert.equal((await x.tool.ask({question:'Synthetic ambiguous click',request_id:'test-unknown-1'})).status,'UNKNOWN');
  assert.equal((await x.tool.ask({question:'Synthetic ambiguous click',request_id:'test-unknown-1'})).status,'UNKNOWN');
  assert.equal(count(x.calls,'trigger'),1);
 }finally{await x.cleanup()}
});
test('transport failure after exclusive claim stays UNKNOWN, including repeat',async()=>{
 const x=await setup({trigger:async()=>{throw Error('CLI process interrupted')}});try{
  assert.equal((await x.tool.ask({question:'Synthetic CLI failure',request_id:'test-error-1234'})).status,'UNKNOWN');
  assert.equal((await x.tool.ask({question:'Synthetic CLI failure',request_id:'test-error-1234'})).status,'UNKNOWN');
  assert.equal(count(x.calls,'trigger'),1);
 }finally{await x.cleanup()}
});
test('Orca readiness failure stops before trigger and before creating journal receipt',async()=>{
 const x=await setup({ready:false});try{
  assert.equal((await x.tool.ask({question:'Synthetic target mismatch',request_id:'test-setup-1234'})).status,'NOT_READY');
  assert.equal(count(x.calls,'trigger'),0);assert.deepEqual(await fs.readdir(x.dir),[]);
 }finally{await x.cleanup()}
});
test('pending answer is collected only for the original prompt hash and conversation identity',async()=>{
 let poll=0;const x=await setup({collect:async()=>poll++?completed:{status:'pending'}});try{
  const a=await x.tool.ask({question:'Synthetic delayed answer',request_id:'test-pending-1'});
  assert.equal(a.status,'PENDING');assert.equal((await x.tool.collect({request_id:'test-pending-1'})).status,'COMPLETED');
  assert.equal(count(x.calls,'trigger'),1);assert.equal(count(x.calls,'collect'),2);
  assert.equal(x.calls.find(x=>x.method==='collect').args.promptHash,sha('Synthetic delayed answer'));
  assert.equal(x.calls.find(x=>x.method==='collect').args.conversationId,id);
 }finally{await x.cleanup()}
});
test('same request ID cannot bind to another question',async()=>{
 const x=await setup();try{
  await x.tool.ask({question:'Synthetic A',request_id:'same-request-id'});
  assert.equal((await x.tool.ask({question:'Synthetic B',request_id:'same-request-id'})).status,'REQUEST_MISMATCH');
  assert.equal(count(x.calls,'trigger'),1);
 }finally{await x.cleanup()}
});
test('a completed answer with wrong conversation identity is rejected',async()=>{
 const wrongId='22222222-2222-4222-8222-222222222222';
 const x=await setup({collect:async()=>({...completed,conversationId:wrongId,conversationUrl:'https://chatgpt.com/c/'+wrongId})});try{
  const a=await x.tool.ask({question:'Synthetic wrong-target reply',request_id:'wrong-target-1234'});
  assert.equal(a.status,'PENDING');assert.equal(a.answer,undefined);
 }finally{await x.cleanup()}
});
test('a process crash after exclusive claim surfaces UNKNOWN without invoking Orca again',async()=>{
 const x=await setup();try{
  const question='Synthetic in-flight question',request_id='crash-receipt-1';
  const file=path.join(x.dir,sha(profile+'\0'+request_id)+'.json');
  await fs.writeFile(file,JSON.stringify({status:'DISPATCHING',request_id,prompt_hash:sha(question)}));
  assert.equal((await x.tool.ask({question,request_id})).status,'UNKNOWN');
  assert.equal(count(x.calls,'trigger'),0);
 }finally{await x.cleanup()}
});
test('a cancelled Pi tool call never initiates Orca operations',async()=>{
 const x=await setup();try{
  const abort=new AbortController();abort.abort();
  const r=await x.tool.ask({question:'Synthetic cancellation',request_id:'cancel-before-send'},abort.signal);
  assert.equal(r.status,'NOT_READY');assert.equal(x.calls.length,0);
 }finally{await x.cleanup()}
});
test('after an ambiguous click, collect may read-only recover exact conversation without resending',async()=>{
 const x=await setup({trigger:async()=>({status:'unknown',reason:'CLICK_OUTCOME_UNKNOWN'}),recover:async({promptHash})=>{
  assert.equal(promptHash,sha('Synthetic navigation race'));return submitted;
 }});try{
  const a=await x.tool.ask({question:'Synthetic navigation race',request_id:'recover-click-1234'});
  assert.equal(a.status,'UNKNOWN');assert.equal(a.reason,'CLICK_OUTCOME_UNKNOWN');
  const b=await x.tool.collect({request_id:'recover-click-1234'});
  assert.equal(b.status,'COMPLETED');assert.equal(b.answer,'Synthetic acknowledgment');assert.equal(b.reason,undefined);
  assert.equal(count(x.calls,'trigger'),1);assert.equal(count(x.calls,'recover'),1);
 }finally{await x.cleanup()}
});
test('arbitrary host UNKNOWN cannot be auto-recovered as a successful click',async()=>{
 const x=await setup({trigger:async()=>{throw Error('host outage')},recover:async()=>submitted});try{
  const a=await x.tool.ask({question:'Synthetic uncertain host failure',request_id:'host-unknown-1234'});
  assert.equal(a.status,'UNKNOWN');assert.equal((await x.tool.collect({request_id:'host-unknown-1234'})).status,'UNKNOWN');
  assert.equal(count(x.calls,'recover'),0);assert.equal(count(x.calls,'trigger'),1);
 }finally{await x.cleanup()}
});
