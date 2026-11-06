import test from 'node:test';
import assert from 'node:assert/strict';
import {registerWebAskCommands} from './commands.mjs';

const names=['ask-gpt','ask-claude','ask-grok','ask-mistral'];
const toolNames=['ask_chatgpt','ask_claude','ask_grok','ask_mistral'];
function setup({collect=async()=>({status:'COMPLETED',request_id:'test-request-0001',answer:'SYNTHETIC_ACK'})}={}){
 const commands=new Map(),userMessages=[],customMessages=[],notifications=[],calls=[];
 const pi={registerCommand:(name,opts)=>commands.set(name,opts),sendMessage:(body,options)=>customMessages.push({body,options}),sendUserMessage:(message,options)=>userMessages.push({message,options})};
 registerWebAskCommands(pi,{getClient:provider=>({ask:async()=>{calls.push({kind:'ask',provider});throw Error('DIRECT_ASK_FORBIDDEN')},collect:async args=>{calls.push({kind:'collect',provider,args});return collect(args,provider)}})});
 return {commands,userMessages,customMessages,notifications,calls,ctx:{cwd:'/synthetic/project',mode:'tui',hasUI:true,ui:{notify:(message,severity)=>notifications.push({message,severity})}}};
}
test('registers exactly four commands linked to existing provider tools',()=>{
 const x=setup();assert.deepEqual([...x.commands.keys()],names);
 for(const name of names)assert.equal(typeof x.commands.get(name).handler,'function');
});
test('each slash command hands intact user instruction to Pi Agent Loop; no direct browser Ask',async()=>{
 const x=setup();for(const name of names)await x.commands.get(name).handler('  請先檢查專案程式再評估是否需要外部諮詢  ',x.ctx);
 assert.equal(x.calls.length,0);assert.equal(x.userMessages.length,4);assert.equal(x.customMessages.length,0);
 for(let i=0;i<names.length;i++){
  const msg=x.userMessages[i].message;
  assert.match(msg,/請先檢查專案程式再評估是否需要外部諮詢/);
  assert.ok(msg.includes(toolNames[i]));assert.match(msg,/read|inspect|檢查|project/i);
  assert.doesNotMatch(msg,/MUST call|必須呼叫|always call/i);
  assert.notEqual(x.userMessages[i].options?.expandPromptTemplates,true); // prevent nested command dispatch
 }
});
test('explicit mandatory-consult instruction is preserved unmodified for Pi to obey',async()=>{
 const x=setup();const source='必須先讀取 src/strategy.ts，然後必須使用 ChatGPT 諮詢，再提供結論';
 await x.commands.get('ask-gpt').handler(source,x.ctx);
 assert.equal(x.calls.length,0);assert.match(x.userMessages[0].message,new RegExp(source));
 assert.ok(x.userMessages[0].message.includes('ask_chatgpt'));
});
test('missing and oversized questions do not start Pi or invoke Orca',async()=>{
 const x=setup();for(const arg of ['', ' ', 'x'.repeat(4001)])await x.commands.get('ask-gpt').handler(arg,x.ctx);
 assert.equal(x.userMessages.length,0);assert.equal(x.calls.length,0);assert.equal(x.notifications.length,3);
});
test('manual --collect remains direct and read-only; does not start an agent turn',async()=>{
 const x=setup();await x.commands.get('ask-grok').handler('--collect test-request-0001',x.ctx);
 assert.deepEqual(x.calls,[{kind:'collect',provider:'grok',args:{request_id:'test-request-0001'}}]);
 assert.equal(x.userMessages.length,0);assert.equal(x.customMessages.length,1);
 assert.match(x.customMessages[0].body.content,/SYNTHETIC_ACK/);assert.equal(x.customMessages[0].options.triggerTurn,false);
});
test('manual --collect never retries Ask and does not claim pending is completed',async()=>{
 const x=setup({collect:async()=>({status:'PENDING',request_id:'test-request-0001'})});
 await x.commands.get('ask-mistral').handler('--collect test-request-0001',x.ctx);
 assert.equal(x.calls.length,1);assert.equal(x.calls[0].kind,'collect');
 assert.match(x.customMessages[0].body.content,/PENDING/);
});
test('malformed --collect is rejected without Agent or Web operation',async()=>{
 const x=setup();for(const q of ['--collect','--collect invalid','--collect test-request-0001 extra'])await x.commands.get('ask-gpt').handler(q,x.ctx);
 assert.equal(x.calls.length,0);assert.equal(x.userMessages.length,0);assert.equal(x.notifications.length,3);
});
