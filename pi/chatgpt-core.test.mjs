import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createChatGptTool } from './chatgpt-core.mjs';

const profile='pi-chatgpt-general';
const ready={status:'ok',config:{adapter:'chatgpt',schedule:{type:'manual'},browser:{connection:'cdp'},adapterConfig:{project:{enabled:false},conversation:{newChatEachRun:true}}},browserEndpoint:{status:'ready'}};
const submitted={status:'ok',result:{status:'triggered',submissionState:'submitted',conversationId:'11111111-1111-4111-8111-111111111111',url:'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111'}};
const completed={status:'ok',result:{status:'completed',conversationId:'11111111-1111-4111-8111-111111111111',url:'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111',text:'Synthetic acknowledgment'}};
async function setup(run=async (cmd,payload)=>cmd==='status'?ready:payload.action==='trigger'?submitted:completed){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-harness-test-'));
  const calls=[];
  const tool=createChatGptTool({profile,stateDir:dir,transport:{run:async(cmd,payload)=>{calls.push([cmd,payload]);return run(cmd,payload)}}});
  return {tool,calls,dir,cleanup:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('one ask returns a verified answer and exact original URL; repeat does not send again',async()=>{
  const x=await setup();try {
    const a=await x.tool.ask({question:'Synthetic bounded question',request_id:'test-one-1234'});
    assert.equal(a.status,'COMPLETED');assert.equal(a.answer,'Synthetic acknowledgment');
    assert.equal(a.conversation_url,'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111');
    assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
    const b=await x.tool.ask({question:'Synthetic bounded question',request_id:'test-one-1234'});
    assert.equal(b.status,'COMPLETED');assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
    const files=await fs.readdir(x.dir);assert.equal(files.length,1);
    assert.equal((await fs.readFile(path.join(x.dir,files[0]),'utf8')).includes('Synthetic bounded question'),false);
  }finally{await x.cleanup()}
});

test('ambiguous trigger is durable and never blindly resent',async()=>{
  const x=await setup(async(cmd,payload)=>cmd==='status'?ready:{status:'ok',result:{status:'ambiguous',submissionState:'unknown',retryable:false}});
  try{const a=await x.tool.ask({question:'Synthetic retry scenario',request_id:'test-unknown-1'});
    assert.equal(a.status,'UNKNOWN');const b=await x.tool.ask({question:'Synthetic retry scenario',request_id:'test-unknown-1'});
    assert.equal(b.status,'UNKNOWN');assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
    assert.equal((await x.tool.collect({request_id:'test-unknown-1'})).status,'UNKNOWN');
  }finally{await x.cleanup()}
});

test('transport interruption after claim is UNKNOWN with no blind retry',async()=>{
  const x=await setup(async(cmd)=>{if(cmd==='status')return ready;throw Error('network disrupted')});
  try{assert.equal((await x.tool.ask({question:'Synthetic error scenario',request_id:'test-error-1234'})).status,'UNKNOWN');
    assert.equal((await x.tool.ask({question:'Synthetic error scenario',request_id:'test-error-1234'})).status,'UNKNOWN');
    assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
  }finally{await x.cleanup()}
});

test('preflight denies an incorrect adapter or project route before sending',async()=>{
  const x=await setup(async()=>({status:'ok',config:{adapter:'mistral',schedule:{type:'manual'},adapterConfig:{project:{enabled:false},conversation:{newChatEachRun:true}}}}));
  try{assert.equal((await x.tool.ask({question:'Synthetic setup check',request_id:'test-setup-1234'})).status,'NOT_READY');
    assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,0);
    assert.deepEqual(await fs.readdir(x.dir),[]);
  }finally{await x.cleanup()}
});

test('pending result can be collected only using the original recorded conversation identity',async()=>{
  let poll=0;const x=await setup(async(cmd,payload)=>cmd==='status'?ready:payload.action==='trigger'?submitted:(poll++?completed:{status:'ok',result:{status:'pending',conversationId:submitted.result.conversationId}}));
  try{const a=await x.tool.ask({question:'Synthetic delayed answer',request_id:'test-pending-1'});
    assert.equal(a.status,'PENDING');
    const b=await x.tool.collect({request_id:'test-pending-1'});
    assert.equal(b.status,'COMPLETED');assert.equal(b.answer,'Synthetic acknowledgment');
    assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
    assert.equal(x.calls.filter(x=>x[1]?.action==='collect').length,2);
  }finally{await x.cleanup()}
});

test('same request_id cannot bind to another prompt; no private data in filesystem receipts',async()=>{
 const x=await setup();try{await x.tool.ask({question:'Synthetic question A',request_id:'same-request-id'});
 const b=await x.tool.ask({question:'Synthetic question B',request_id:'same-request-id'});
 assert.equal(b.status,'REQUEST_MISMATCH');assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,1);
 }finally{await x.cleanup()}
});

test('CDP profile without a ready endpoint is rejected during read-only preflight',async()=>{
 const x=await setup(async()=>({...ready,browserEndpoint:{status:'absent'}}));
 try{assert.equal((await x.tool.ask({question:'Synthetic offline browser',request_id:'test-cdp-offline-1'})).status,'NOT_READY');
 assert.equal(x.calls.filter(x=>x[1]?.action==='trigger').length,0)}finally{await x.cleanup()}
});

test('a process crash after exclusive claim surfaces UNKNOWN and cannot trigger again',async()=>{
 const x=await setup();try{
  const question='Synthetic preexisting in-flight question',id='crash-receipt-1';
  const {createHash}=await import('node:crypto');const sha=t=>createHash('sha256').update(t).digest('hex');
  const dest=path.join(x.dir,sha(profile+'\0'+id)+'.json');
  await fs.writeFile(dest,JSON.stringify({status:'DISPATCHING',request_id:id,prompt_hash:sha(question)}));
  assert.equal((await x.tool.ask({question,request_id:id})).status,'UNKNOWN');
  assert.equal(x.calls.filter(y=>y[1]?.action==='trigger').length,0);
 }finally{await x.cleanup()}
});

test('cancelled Pi tool call never attempts a Browser send',async()=>{
 const x=await setup();try{
 const abort=new AbortController();abort.abort();
 const r=await x.tool.ask({question:'Synthetic cancellation test',request_id:'cancel-before-send'},abort.signal);
 assert.equal(r.status,'NOT_READY');assert.equal(x.calls.length,0);
 }finally{await x.cleanup()}
});
