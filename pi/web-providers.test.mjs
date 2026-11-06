import test from 'node:test';
import assert from 'node:assert/strict';
import {WEB_PROVIDERS,validateConversation,conversationIdFromUrl,editorRefForSnapshot} from './web-providers.mjs';

const examples={chatgpt:'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111',claude:'https://claude.ai/chat/11111111-1111-4111-8111-111111111111',grok:'https://grok.com/c/11111111-1111-4111-8111-111111111111',mistral:'https://chat.mistral.ai/work/11111111-1111-4111-8111-111111111111'};
for(const [provider,url] of Object.entries(examples))test(`${provider} has isolated origin, new chat route and exact canonical conversation identity`,()=>{
 const site=WEB_PROVIDERS[provider];assert.ok(site);assert.ok(site.home.startsWith(site.origin));
 assert.equal(conversationIdFromUrl(provider,url),'11111111-1111-4111-8111-111111111111');
 assert.equal(validateConversation(provider,url,'11111111-1111-4111-8111-111111111111'),true);
 assert.equal(validateConversation(provider,url,'22222222-2222-4222-8222-222222222222'),false);
 for(const name of Object.keys(examples).filter(n=>n!==provider))assert.equal(validateConversation(name,url,'11111111-1111-4111-8111-111111111111'),false);
 assert.equal(conversationIdFromUrl(provider,url+'?share=1'),null);
});
test('readiness selectors respect different Orca snapshot roles for Claude, Grok and Mistral',()=>{
 assert.equal(editorRefForSnapshot('claude',{refs:{e1:{role:'textbox',name:'Write your prompt to Claude'}}}),'e1');
 assert.equal(editorRefForSnapshot('grok',{refs:{e2:{role:'combobox',name:'問 Grok 任何事'}}}),'e2');
 assert.equal(editorRefForSnapshot('mistral',{refs:{e3:{role:'generic',name:''}},snapshot:'- generic [ref=e3] editable [contenteditable]:'}),'e3');
 assert.equal(editorRefForSnapshot('mistral',{refs:{e3:{role:'generic',name:''}},snapshot:'- generic [ref=e3] clickable:'}),null);
});

test('Claude assistant extraction excludes toolbar and header but preserves response markdown',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {WEB_READONLY_INSPECT_JS}=await import('./web-providers.mjs');
 const answer={innerText:'EXACT_CLAUDE_ACK'};
 const card={innerText:'Claude responded\nEXACT_CLAUDE_ACK\nShare Retry',querySelector:s=>s==='.prose'?answer:null,getClientRects:()=>[{}]};
 const user={innerText:'Synthetic question',getClientRects:()=>[{}]};
 const editor={innerText:'',getClientRects:()=>[{}]};
 const document={querySelectorAll(s){if(s.includes('chat-input'))return [editor];if(s.includes('assistant-message'))return [card];if(s.includes('user-message'))return [user];return []},querySelector:()=>null};
 const state=runInNewContext(WEB_READONLY_INSPECT_JS.claude,{document,location:{origin:'https://claude.ai',pathname:'/chat/12345678-1234-4234-8234-123456789abc'}});
 assert.equal(state.lastUserText,'Synthetic question');assert.equal(state.assistantText,'EXACT_CLAUDE_ACK');
});

test('Grok user and assistant body extraction excludes 您/Grok header labels',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {WEB_READONLY_INSPECT_JS}=await import('./web-providers.mjs');
 const userBody={innerText:'EXACT_GROK_QUESTION'},assistantBody={innerText:'EXACT_GROK_ACK'};
 const user={innerText:'您\nEXACT_GROK_QUESTION',getClientRects:()=>[{}],querySelector:()=>userBody};
 const assistant={innerText:'Grok\nEXACT_GROK_ACK',getClientRects:()=>[{}],querySelector:()=>assistantBody};
 const editor={innerText:'',getClientRects:()=>[{}]};
 const document={querySelectorAll(s){if(s.includes('contenteditable'))return [editor];if(s.includes('assistant-message'))return [assistant];if(s.includes('user-message'))return [user];return []},querySelector:()=>null};
 const state=runInNewContext(WEB_READONLY_INSPECT_JS.grok,{document,location:{origin:'https://grok.com',pathname:'/c/12345678-1234-4234-8234-123456789abc'}});
 assert.equal(state.lastUserText,'EXACT_GROK_QUESTION');assert.equal(state.assistantText,'EXACT_GROK_ACK');
});

test('Grok observed rid query is validated but excluded from durable canonical conversation URL',async()=>{
 const {canonicalPageUrl}=await import('./web-providers.mjs');
 const base=examples.grok,rid='22222222-2222-4222-8222-222222222222';
 assert.equal(conversationIdFromUrl('grok',base+'?rid='+rid),'11111111-1111-4111-8111-111111111111');
 assert.equal(canonicalPageUrl('grok',base+'?rid='+rid),base);
 assert.equal(conversationIdFromUrl('grok',base+'?rid=not-a-uuid'),null);
 assert.equal(conversationIdFromUrl('grok',base+'?rid='+rid+'&other=1'),null);
 assert.equal(conversationIdFromUrl('claude',examples.claude+'?rid='+rid),null);
});

test('Mistral original user text comes from the message bubble rather than an absent data-testid',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {WEB_READONLY_INSPECT_JS}=await import('./web-providers.mjs');
 const user={innerText:'EXACT_MISTRAL_QUESTION',getClientRects:()=>[{}]};
 const assistant={innerText:'EXACT_MISTRAL_ACK',getClientRects:()=>[{}]};
 const editor={innerText:'',getClientRects:()=>[{}]};
 const document={querySelectorAll(s){if(s.includes('ProseMirror'))return [editor];if(s.includes('bg-basic-gray-alpha-4'))return [user];if(s.includes('message-part-type="answer"'))return [assistant];return []},querySelector:()=>null};
 const state=runInNewContext(WEB_READONLY_INSPECT_JS.mistral,{document,location:{origin:'https://chat.mistral.ai',pathname:'/work/12345678-1234-4234-8234-123456789abc'}});
 assert.equal(state.lastUserText,'EXACT_MISTRAL_QUESTION');assert.equal(state.assistantText,'EXACT_MISTRAL_ACK');
});
