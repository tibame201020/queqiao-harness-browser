import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentSendGuard} from './agent-send-guard.mjs';

test('unknown send prevents a changed-question Ask in the same Pi run; preserves original receipt',()=>{
 const g=createAgentSendGuard();g.beginAgent();
 assert.equal(g.beforeAsk('chatgpt'),null);
 g.afterAsk('chatgpt',{status:'UNKNOWN',reason:'POST_CLICK_UNVERIFIED',request_id:'first-synthetic-001'});
 const block=g.beforeAsk('chatgpt');assert.equal(block?.block,true);assert.equal(block?.terminate,true);assert.match(block.reason,/first-synthetic-001/);
 assert.match(block.reason,/collect_chatgpt/);
});
test('pending response remains single-send until verified collect; full completed result releases guard',()=>{
 const g=createAgentSendGuard();g.beginAgent();g.beforeAsk('chatgpt');
 g.afterAsk('chatgpt',{status:'PENDING',request_id:'synthetic-001'});
 assert.equal(g.beforeAsk('chatgpt')?.block,true);
 g.afterCollect('chatgpt',{status:'COMPLETED',request_id:'synthetic-001',answer:'ACK'});
 assert.equal(g.beforeAsk('chatgpt'),null);
});
test('while a first Ask runs, a sibling Ask cannot double-submit',()=>{
 const g=createAgentSendGuard();g.beginAgent();assert.equal(g.beforeAsk('chatgpt'),null);
 assert.equal(g.beforeAsk('chatgpt')?.terminate,true);
 g.afterAsk('chatgpt',{status:'COMPLETED',request_id:'a-12345678',answer:'A'});
 assert.equal(g.beforeAsk('chatgpt'),null);
});
test('unknown ChatGPT does not block Claude or another user Agent run',()=>{
 const g=createAgentSendGuard();g.beginAgent();g.beforeAsk('chatgpt');g.afterAsk('chatgpt',{status:'UNKNOWN',request_id:'a-12345678'});
 assert.equal(g.beforeAsk('claude'),null);
 g.beginAgent();assert.equal(g.beforeAsk('chatgpt'),null);
});
test('definitely pre-send NOT_SENT can be retried when user/model repairs the question',()=>{
 const g=createAgentSendGuard();g.beginAgent();g.beforeAsk('chatgpt');g.afterAsk('chatgpt',{status:'NOT_SENT',reason:'PROMPT_INTEGRITY_FAILED',request_id:'bad-12345678'});
 assert.equal(g.beforeAsk('chatgpt'),null);
});
test('wrong request_id collect cannot release an unresolved Ask',()=>{
 const g=createAgentSendGuard();g.beginAgent();g.beforeAsk('chatgpt');g.afterAsk('chatgpt',{status:'UNKNOWN',request_id:'first-0001'});
 g.afterCollect('chatgpt',{status:'COMPLETED',request_id:'other-0002'});
 assert.equal(g.beforeAsk('chatgpt')?.block,true);
});
