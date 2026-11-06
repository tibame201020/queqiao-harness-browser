import test from 'node:test';
import assert from 'node:assert/strict';
import {registerWebAskCommands} from './commands.mjs';

const expected=[['ask-gpt','chatgpt'],['ask-claude','claude'],['ask-grok','grok'],['ask-mistral','mistral']];
function setup({ask=async()=>({status:'COMPLETED',request_id:'synthetic-req-0001',answer:'SYNTHETIC_ACK'}),collect=async()=>({status:'COMPLETED',request_id:'synthetic-req-0001',answer:'SYNTHETIC_ACK'}),sleep=async()=>{}}={}){
 const commands=new Map(),messages=[],notifications=[],calls=[];
 const pi={registerCommand:(name,opts)=>commands.set(name,opts),sendMessage:(body,options)=>messages.push({body,options})};
 registerWebAskCommands(pi,{getClient:provider=>({ask:async args=>{calls.push({kind:'ask',provider,args});return ask(args,provider)},collect:async args=>{calls.push({kind:'collect',provider,args});return collect(args,provider)}}),sleep,maxCollectAttempts:3});
 return {commands,messages,notifications,calls,ctx:{mode:'tui',hasUI:true,ui:{notify:(message,severity)=>notifications.push({message,severity})}}};
}

test('registers exactly four Pi slash commands and preserves existing tool surface',()=>{
 const x=setup();assert.deepEqual([...x.commands.keys()],expected.map(x=>x[0]));
 for(const [command,provider] of expected){assert.equal(typeof x.commands.get(command).handler,'function');assert.match(x.commands.get(command).description,new RegExp(provider==='chatgpt'?'ChatGPT':provider,'i'))}
});
test('slash command sends exact user question to matching Core once and displays answer without triggering a model turn',async()=>{
 const x=setup();
 for(const [name,provider] of expected){await x.commands.get(name).handler('  請只回答 hello  ',x.ctx)}
 assert.equal(x.calls.length,4);assert.deepEqual(x.calls.map(x=>x.provider),expected.map(x=>x[1]));
 for(const call of x.calls){assert.equal(call.kind,'ask');assert.deepEqual(call.args,{question:'請只回答 hello'})}
 assert.equal(x.messages.length,4);
 for(const {body,options} of x.messages){assert.equal(body.display,true);assert.match(body.content,/SYNTHETIC_ACK/);assert.equal(options.triggerTurn,false);assert.equal(body.details.status,'COMPLETED')}
});
test('pending Ask uses bounded read-only collect and no retry of ask',async()=>{
 let count=0;const x=setup({ask:async()=>({status:'PENDING',request_id:'pending-0001'}),collect:async()=>++count===2?{status:'COMPLETED',request_id:'pending-0001',answer:'FINAL'}:{status:'PENDING',request_id:'pending-0001'}});
 await x.commands.get('ask-grok').handler('Question',x.ctx);
 assert.deepEqual(x.calls.map(x=>x.kind),['ask','collect','collect']);
 assert.equal(x.messages.length,1);assert.match(x.messages[0].body.content,/FINAL/);
});
test('exhausted pending shows a receipt and manual --collect form without blind resend',async()=>{
 const x=setup({ask:async()=>({status:'PENDING',request_id:'pending-0001'}),collect:async()=>({status:'PENDING',request_id:'pending-0001'})});
 await x.commands.get('ask-mistral').handler('Question',x.ctx);
 assert.equal(x.calls.filter(x=>x.kind==='ask').length,1);assert.equal(x.calls.filter(x=>x.kind==='collect').length,3);
 assert.match(x.messages[0].body.content,/pending-0001/);assert.match(x.messages[0].body.content,/\/ask-mistral --collect pending-0001/);
});
test('manual collect calls only the matching provider collect once; accepts an UNKNOWN receipt without resending',async()=>{
 const x=setup({collect:async()=>({status:'UNKNOWN',reason:'POST_CLICK_UNVERIFIED',request_id:'saved-id-0001'})});
 await x.commands.get('ask-gpt').handler('--collect saved-id-0001',x.ctx);
 assert.deepEqual(x.calls,[{kind:'collect',provider:'chatgpt',args:{request_id:'saved-id-0001'}}]);
 assert.match(x.messages[0].body.content,/UNKNOWN/);assert.match(x.messages[0].body.content,/saved-id-0001/);
});
test('missing/invalid question and malformed --collect never use a provider client',async()=>{
 const x=setup();for(const arg of ['', '   ','--collect', '--collect invalid','x'.repeat(4001)])await x.commands.get('ask-gpt').handler(arg,x.ctx);
 assert.equal(x.calls.length,0);assert.equal(x.messages.length,0);assert.equal(x.notifications.length,5);
});
test('failure is surfaced without claiming a completed send',async()=>{
 const x=setup({ask:async()=>{throw Error('SYNTHETIC_IO_FAILURE')}});
 await x.commands.get('ask-claude').handler('hi',x.ctx);
 assert.equal(x.calls.length,1);assert.equal(x.messages.length,0);assert.equal(x.notifications.length,1);assert.equal(x.notifications[0].severity,'error');
});
test('long answers are bounded in displayed Pi context while full answer remains in Core journal',async()=>{
 const x=setup({ask:async()=>({status:'COMPLETED',request_id:'synthetic-req-0001',answer:'A'.repeat(20000)})});
 await x.commands.get('ask-gpt').handler('hi',x.ctx);
 assert.ok(x.messages[0].body.content.length<15000);assert.match(x.messages[0].body.content,/truncated/i);
});
