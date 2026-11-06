import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import registerPi from './extension.mjs';

test('Pi 0.85 tool interface exposes only fixed generic ChatGPT tools, no Orca control or role arguments',()=>{
 const registered=new Map();registerPi({registerTool:t=>registered.set(t.name,t)});
 assert.deepEqual([...registered.keys()],['ask_chatgpt','collect_chatgpt','chatgpt_status','chatgpt_readiness']);
 for(const t of registered.values())assert.equal(typeof t.execute,'function');
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
   const registered=new Map();registerPi({registerTool:t=>registered.set(t.name,t)});
   const r=await registered.get('chatgpt_status').execute('synthetic',{request_id:'test-missing-1'});
   assert.equal(JSON.parse(r.content[0].text).status,'NOT_FOUND');
 }finally{if(old===undefined)delete process.env.QUEQIAO_PI_CHATGPT_CONFIG;else process.env.QUEQIAO_PI_CHATGPT_CONFIG=old;await fs.rm(dir,{recursive:true,force:true})}
});
