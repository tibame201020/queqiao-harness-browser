import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import registerPi from './extension.mjs';

test('Pi 0.85 tool interface exposes four explicit providers, no Orca control or role arguments',()=>{
 const registered=new Map(),commands=new Map();registerPi({registerTool:t=>registered.set(t.name,t),registerCommand:(name,options)=>commands.set(name,options)});
 assert.deepEqual([...registered.keys()],['ask_chatgpt','collect_chatgpt','chatgpt_status','chatgpt_readiness','ask_claude','collect_claude','claude_status','claude_readiness','ask_grok','collect_grok','grok_status','grok_readiness','ask_mistral','collect_mistral','mistral_status','mistral_readiness']);
 assert.deepEqual([...commands.keys()],['ask-gpt','ask-claude','ask-grok','ask-mistral']);
 for(const t of registered.values())assert.equal(typeof t.execute,'function');
 for(const name of ['chatgpt','claude','grok','mistral'])assert.deepEqual(Object.keys(registered.get(`ask_${name}`).parameters.properties).sort(),['question','request_id']);
 const ask=registered.get('ask_chatgpt');assert.deepEqual(Object.keys(ask.parameters.properties).sort(),['question','request_id']);
 for(const banned of ['profile','provider','agentId','companyId','conversationId','url','role'])assert.equal(banned in ask.parameters.properties,false);
});

test('Pi read status tool works without browser invocation or user profile contents in repository',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-ext-unit-'));
 const old=process.env.QUEQIAO_PI_CHATGPT_CONFIG;
 try{
   const config=path.join(dir,'config.json');
   await fs.writeFile(config,JSON.stringify({profile:'synthetic-pi',worktree:'id:synthetic::/example',pageId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',stateDir:path.join(dir,'state'),lockFile:path.join(dir,'orca.lock')}));
   process.env.QUEQIAO_PI_CHATGPT_CONFIG=config;
   const registered=new Map(),commands=new Map();registerPi({registerTool:t=>registered.set(t.name,t),registerCommand:(name,options)=>commands.set(name,options)});
   const r=await registered.get('chatgpt_status').execute('synthetic',{request_id:'test-missing-1'});
   assert.equal(JSON.parse(r.content[0].text).status,'NOT_FOUND');
 }finally{if(old===undefined)delete process.env.QUEQIAO_PI_CHATGPT_CONFIG;else process.env.QUEQIAO_PI_CHATGPT_CONFIG=old;await fs.rm(dir,{recursive:true,force:true})}
});

test('four public provider status tools use one local config but distinct journals, with no browser action',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-four-status-test-'));
 const old=process.env.QUEQIAO_PI_CHATGPT_CONFIG;
 try{
  const providers=Object.fromEntries(['chatgpt','claude','grok','mistral'].map((name,i)=>[name,{worktree:'id:synthetic-repo::/synthetic/pi-usage',pageId:`${String(i+1).repeat(8)}-1111-4111-8111-111111111111`}]));
  const cfg=path.join(dir,'config.json');
  await fs.writeFile(cfg,JSON.stringify({profile:'synthetic-multi',stateDir:path.join(dir,'state'),lockFile:path.join(dir,'orca.lock'),providers}));
  process.env.QUEQIAO_PI_CHATGPT_CONFIG=cfg;
  const map=new Map(),commands=new Map();registerPi({registerTool:t=>map.set(t.name,t),registerCommand:(name,options)=>commands.set(name,options)});
  for(const name of Object.keys(providers)){
   const r=await map.get(`${name}_status`).execute('test',{request_id:'synthetic-status-001'});
   assert.equal(JSON.parse(r.content[0].text).status,'NOT_FOUND');
   assert.equal(r.details.provider,name);
  }
 }finally{if(old===undefined)delete process.env.QUEQIAO_PI_CHATGPT_CONFIG;else process.env.QUEQIAO_PI_CHATGPT_CONFIG=old;await fs.rm(dir,{recursive:true,force:true})}
});

test('Pi native agent_start/tool_call prevents unresolved Web Ask with altered question while allowing collect and other providers',async()=>{
 const events=new Map(),registered=new Map(),commands=new Map();
 registerPi({registerTool:x=>registered.set(x.name,x),registerCommand:(name,x)=>commands.set(name,x),on:(name,fn)=>events.set(name,fn)});
 assert.equal(typeof events.get('before_agent_start'),'function');
 assert.equal(typeof events.get('tool_call'),'function');
 events.get('before_agent_start')();
 assert.equal(events.get('tool_call')({toolName:'ask_chatgpt',input:{question:'first synthetic'}}),undefined);
 // Do not submit: simulate the tool's returned ambiguous state via the guard's native result lifecycle in a synthetic config.
 // Preflight alone already prevents a parallel second ask before the first has completed.
 const parallel=events.get('tool_call')({toolName:'ask_chatgpt',input:{question:'different synthetic'}});
 assert.equal(parallel.block,true);assert.equal(parallel.terminate,true);
 assert.match(parallel.reason,/collect_chatgpt/);
 assert.equal(events.get('tool_call')({toolName:'collect_chatgpt',input:{request_id:'synthetic-001'}}),undefined);
 assert.equal(events.get('tool_call')({toolName:'ask_claude',input:{question:'independent other provider'}}),undefined);
 events.get('before_agent_start')();
 assert.equal(events.get('tool_call')({toolName:'ask_chatgpt',input:{question:'later user turn'}}),undefined);
});

test('an actual journal UNKNOWN produces an actionable tool response and blocks a rewritten second Ask within the same Pi run',async()=>{
 const {createHash}=await import('node:crypto');
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-guard-unknown-'));
 const old=process.env.QUEQIAO_PI_CHATGPT_CONFIG;
 try{
  const profile='synthetic-guard',stateDir=path.join(dir,'state'),config=path.join(dir,'config.json');
  await fs.mkdir(stateDir);
  await fs.writeFile(config,JSON.stringify({profile,stateDir,lockFile:path.join(dir,'lock'),providers:{chatgpt:{worktree:'id:synthetic-repo::/synthetic/path',pageId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}}));
  process.env.QUEQIAO_PI_CHATGPT_CONFIG=config;
  const request_id='synthetic-unknown-0001',question='The first synthetic question';
  const saved={status:'UNKNOWN',reason:'POST_CLICK_UNVERIFIED',request_id,prompt_hash:hash(question)};
  await fs.writeFile(path.join(stateDir,hash(profile+'\0'+request_id)+'.json'),JSON.stringify(saved));
  const registered=new Map(),events=new Map(),commands=new Map();
  registerPi({registerTool:x=>registered.set(x.name,x),registerCommand:(name,x)=>commands.set(name,x),on:(event,handler)=>events.set(event,handler)});
  events.get('before_agent_start')();
  assert.equal(events.get('tool_call')({toolName:'ask_chatgpt'}),undefined);
  const first=JSON.parse((await registered.get('ask_chatgpt').execute('first',{question,request_id})).content[0].text);
  assert.equal(first.status,'UNKNOWN');assert.equal(first.reason,'POST_CLICK_UNVERIFIED');
  assert.match(first.next_action,/collect_chatgpt/);assert.match(first.next_action,/Do not call ask_chatgpt again/);
  const blocked=events.get('tool_call')({toolName:'ask_chatgpt',input:{question:'The second altered question'}});
  assert.equal(blocked.block,true);assert.equal(blocked.terminate,true);assert.match(blocked.reason,/synthetic-unknown-0001/);
  assert.equal(events.get('tool_call')({toolName:'collect_chatgpt',input:{request_id}}),undefined);
 }finally{if(old===undefined)delete process.env.QUEQIAO_PI_CHATGPT_CONFIG;else process.env.QUEQIAO_PI_CHATGPT_CONFIG=old;await fs.rm(dir,{recursive:true,force:true})}
});

test('a VERIFIED COMPLETED status releases an earlier PENDING hold; the same Pi user prompt may consult again',async()=>{
 const {createHash}=await import('node:crypto');const hash=x=>createHash('sha256').update(x).digest('hex');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-guard-status-'));
 const original=process.env.QUEQIAO_PI_CHATGPT_CONFIG;
 try{
  const profile='synthetic-state',stateDir=path.join(dir,'state'),cfg=path.join(dir,'cfg.json'),request_id='synthetic-pending-0001',question='synthetic question for status';
  await fs.mkdir(stateDir);
  await fs.writeFile(cfg,JSON.stringify({profile,stateDir,lockFile:path.join(dir,'lock'),providers:{chatgpt:{worktree:'id:synthetic-repo::/synthetic/path',pageId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}}));
  process.env.QUEQIAO_PI_CHATGPT_CONFIG=cfg;
  const file=path.join(stateDir,hash(profile+'\0'+request_id)+'.json');
  const base={request_id,status:'PENDING',prompt_hash:hash(question)};
  await fs.writeFile(file,JSON.stringify(base));
  const tools=new Map(),events=new Map(),commands=new Map();
  registerPi({registerTool:t=>tools.set(t.name,t),registerCommand:(name,v)=>commands.set(name,v),on:(name,handler)=>events.set(name,handler)});
  events.get('before_agent_start')();assert.equal(events.get('tool_call')({toolName:'ask_chatgpt'}),undefined);
  const first=JSON.parse((await tools.get('ask_chatgpt').execute('synthetic',{question,request_id})).content[0].text);
  assert.equal(first.status,'PENDING');assert.equal(events.get('tool_call')({toolName:'ask_chatgpt'})?.block,true);
  await fs.writeFile(file,JSON.stringify({...base,status:'COMPLETED',answer:'SYNTHETIC_ACK',completion_evidence:'latest-assistant-terminal-action-v1'}));
  const last=JSON.parse((await tools.get('chatgpt_status').execute('synthetic',{request_id})).content[0].text);
  assert.equal(last.status,'COMPLETED');
  assert.equal(events.get('tool_call')({toolName:'ask_chatgpt'}),undefined,'status completion must release hold');
 }finally{if(original===undefined)delete process.env.QUEQIAO_PI_CHATGPT_CONFIG;else process.env.QUEQIAO_PI_CHATGPT_CONFIG=original;await fs.rm(dir,{recursive:true,force:true})}
});
