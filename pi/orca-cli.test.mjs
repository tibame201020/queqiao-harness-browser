import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOrcaCliTransport,ORCA_READONLY_INSPECT_JS} from './orca-cli.mjs';

const worktree='id:synthetic-repo::/synthetic/pi-usage';
const pageId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const conversation='11111111-1111-4111-8111-111111111111';
const chatUrl='https://chatgpt.com/c/'+conversation;
const prompt='Synthetic Pi integration question';
const sha=x=>createHash('sha256').update(x).digest('hex');
const tab=(url='https://chatgpt.com/',id=pageId,worktreeId='synthetic-repo::/synthetic/pi-usage')=>({browserPageId:id,worktreeId,url});
const snapshot=(url='https://chatgpt.com/')=>({origin:url,url,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Ask ChatGPT'},e2:{role:'button',name:'Send message'}}});
function stub(steps){const calls=[];const run=async(command,args)=>{calls.push([command,args]);const step=steps.shift();assert.equal(command,step[0]);const value=typeof step[1]==='function'?step[1](args):step[1];if(value instanceof Error)throw value;return value};return {calls,run}}
const opts=run=>({cli:'orca-ide',worktree,pageId,run,settleMs:0});
test('readiness pins an exact page ID and worktree without switching, closing or creating tabs',async()=>{
 const f=stub([['tab',{tabs:[tab()]}],['snapshot',snapshot()]]);
 const tool=createOrcaCliTransport(opts(f.run));
 assert.equal(await tool.readiness(),true);
 for(const [cmd,args] of f.calls){assert.ok(!['close','switch','create','goto'].includes(cmd));assert.ok(args.includes(worktree));}
 assert.equal(f.calls.filter(x=>x[0]==='snapshot')[0][1].includes(pageId),true);
});
test('unknown, wrong-worktree or non-ChatGPT page fails closed before any interaction',async()=>{
 for(const entry of [tab('https://chatgpt.com/','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),tab('https://chatgpt.com/',pageId,'wrong::/path'),tab('https://claude.ai/')]){
  const f=stub([['tab',{tabs:[entry]}]]);const tool=createOrcaCliTransport(opts(f.run));
  assert.equal(await tool.readiness(),false);assert.equal(f.calls.length,1);
 }
});
test('trigger checks empty composer, fills exact question, verifies draft then clicks only the exact target',async()=>{
 const f=stub([['tab',{tabs:[tab()]}],['eval',{url:'https://chatgpt.com/',editorText:'',generationActive:false}],
  ['snapshot',snapshot()],['fill',args=>{assert.ok(args.includes(prompt));return {ok:true}}],
  ['eval',{url:'https://chatgpt.com/',editorText:prompt,generationActive:false}],
  ['snapshot',snapshot()],['click',{ok:true}],
  ['tab',{tabs:[tab(chatUrl)]}],['eval',{url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'',generationActive:true}]]);
 const tool=createOrcaCliTransport(opts(f.run));
 const r=await tool.trigger({question:prompt});
 assert.equal(r.status,'submitted');assert.equal(r.conversationId,conversation);
 const click=f.calls.find(x=>x[0]==='click');assert.ok(click[1].includes(pageId));assert.ok(click[1].includes('--expect-url'));
 assert.ok(f.calls.every(x=>x[0]!=='close'&&x[0]!=='switch'&&x[0]!=='create'));
});
test('preflight with existing draft never modifies that tab and is NOT_SENT',async()=>{
 const f=stub([['tab',{tabs:[tab()]}],['eval',{url:'https://chatgpt.com/',editorText:'existing draft',generationActive:false}]]);
 const r=await createOrcaCliTransport(opts(f.run)).trigger({question:prompt});
 assert.deepEqual(r,{status:'not_sent',reason:'DRAFT_PRESENT'});assert.equal(f.calls.length,2);
});
test('click timeout must be UNKNOWN and never be automatically resent',async()=>{
 const f=stub([['tab',{tabs:[tab()]}],['eval',{url:'https://chatgpt.com/',editorText:'',generationActive:false}],
 ['snapshot',snapshot()],['fill',{ok:true}],['eval',{url:'https://chatgpt.com/',editorText:prompt,generationActive:false}],['snapshot',snapshot()],['click',Error('browser click timed out')]]);
 const r=await createOrcaCliTransport(opts(f.run)).trigger({question:prompt});
 assert.equal(r.status,'unknown');assert.equal(f.calls.filter(x=>x[0]==='click').length,1);
});
test('collect requires correct original conversation, question hash, final assistant text and stability',async()=>{
 const body={url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Synthetic acknowledgment',generationActive:false,generationComplete:true};
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',body],['eval',body]]);
 const r=await createOrcaCliTransport({...opts(f.run),settleMs:0}).collect({conversationId:conversation,conversationUrl:chatUrl,promptHash:sha(prompt)});
 assert.equal(r.status,'completed');assert.equal(r.text,'Synthetic acknowledgment');assert.equal(r.conversationId,conversation);
});
test('collect fails closed when final user question mismatches durable hash',async()=>{
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',{url:chatUrl,lastUserText:'Different user question',userCount:1,assistantText:'Wrong answer',generationActive:false}]]);
 const r=await createOrcaCliTransport(opts(f.run)).collect({conversationId:conversation,conversationUrl:chatUrl,promptHash:sha(prompt)});
 assert.equal(r.status,'unknown');
});
test('transport refuses active worktree selectors and invalid page IDs',()=>{
 assert.throws(()=>createOrcaCliTransport({...opts(async()=>{}),worktree:'active'}),/WORKTREE/);
 assert.throws(()=>createOrcaCliTransport({...opts(async()=>{}),pageId:'active'}),/PAGE_ID/);
});

test('read-only DOM inspection recognizes actual ChatGPT heading-based conversation turns, not only legacy data attributes',async()=>{
 const {runInNewContext}=await import('node:vm');
 const user={innerText:'你說：'},assistant={innerText:'ChatGPT 說：'};
 user.parentElement={children:[user,{innerText:prompt}]};
 assistant.parentElement={children:[assistant,{innerText:'Synthetic acknowledgment'}]};
 const box={innerText:'',getClientRects:()=>[{}]};
 const document={querySelectorAll(selector){
  if(selector==='h4')return [user,assistant];
  if(selector.includes('data-message-author-role'))return [];
  if(selector.includes('contenteditable'))return [box];
  return [];
 },querySelector:()=>null};
 const state=runInNewContext(ORCA_READONLY_INSPECT_JS,{document,location:{origin:'https://chatgpt.com',pathname:'/c/'+conversation}});
 assert.equal(state.lastUserText,prompt);
 assert.equal(state.assistantText,'Synthetic acknowledgment');
 assert.equal(state.editorText,'');
 assert.equal(state.userCount,1);
});

test('a click error after actual navigation can be reconciled by read-only verified user turn, never by another click',async()=>{
 const f=stub([['tab',{tabs:[tab()]}],['eval',{url:'https://chatgpt.com/',editorText:'',generationActive:false}],
 ['snapshot',snapshot()],['fill',{ok:true}],['eval',{url:'https://chatgpt.com/',editorText:prompt,generationActive:false}],
 ['snapshot',snapshot()],['click',Error('navigation invalidated click receipt')],
 ['tab',{tabs:[tab(chatUrl)]}],['eval',{url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Synthetic acknowledgment',generationActive:false}]]);
 const r=await createOrcaCliTransport(opts(f.run)).trigger({question:prompt});
 assert.equal(r.status,'submitted');assert.equal(r.conversationId,conversation);
 assert.equal(f.calls.filter(([op])=>op==='click').length,1);
 assert.ok(!f.calls.some(([op])=>op==='close'||op==='switch'));
});

test('read-only recover confirms only the pinned conversation with the exact prompt hash',async()=>{
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',{url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Synthetic acknowledgment',generationActive:false}]]);
 const r=await createOrcaCliTransport(opts(f.run)).recover({promptHash:sha(prompt)});
 assert.equal(r.status,'submitted');assert.equal(r.conversationId,conversation);
 assert.ok(f.calls.every(([op])=>op==='tab'||op==='eval'));
});

test('Claude waits for React to render the exact Send message control after fill, never clicks early',async()=>{
 const claudeHome='https://claude.ai/new',claudeUrl='https://claude.ai/chat/'+conversation;
 const claudeSnap=send=>({url:claudeHome,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Write your prompt to Claude'},...(send?{e2:{role:'button',name:'Send message'}}:{})}});
 const f=stub([['tab',{tabs:[tab(claudeHome)]}],['eval',{url:claudeHome,editorText:'',editorCount:1,generationActive:false}],
  ['snapshot',claudeSnap(false)],['fill',{ok:true}],['eval',{url:claudeHome,editorText:prompt,editorCount:1,generationActive:false}],
  ['snapshot',claudeSnap(false)],['snapshot',claudeSnap(true)],['click',{ok:true}],
  ['tab',{tabs:[tab(claudeUrl)]}],['eval',{url:claudeUrl,lastUserText:prompt,userCount:1,assistantText:'ACK',generationActive:false}]]);
 const result=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.equal(result.status,'submitted');assert.equal(f.calls.filter(([op])=>op==='click').length,1);
});

test('Grok sends with one Enter on its pinned combobox, then read-only recovers canonical URL without rid',async()=>{
 const grokHome='https://grok.com/',rid='22222222-2222-4222-8222-222222222222';
 const grokUrl='https://grok.com/c/'+conversation+'?rid='+rid;
 const f=stub([['tab',{tabs:[tab(grokHome)]}],['eval',{url:grokHome,editorCount:1,editorText:'',generationActive:false}],
  ['snapshot',{url:grokHome,browserPageId:pageId,refs:{e1:{role:'combobox',name:'Ask Grok'}}}],
  ['fill',{ok:true}],['eval',{url:grokHome,editorCount:1,editorText:prompt,generationActive:false}],
  ['keypress',args=>{assert.ok(args.includes('--expect-url'));assert.ok(args.includes(pageId));return {ok:true}}],
  ['tab',{tabs:[tab(grokUrl)]}],['eval',{url:'https://grok.com/c/'+conversation,lastUserText:prompt,userCount:1,assistantText:'ACK',generationActive:false}]]);
 const x=await createOrcaCliTransport({...opts(f.run),provider:'grok'}).trigger({question:prompt});
 assert.equal(x.status,'submitted');assert.equal(x.conversationUrl,'https://grok.com/c/'+conversation);
 assert.equal(f.calls.filter(([cmd])=>cmd==='keypress').length,1);assert.equal(f.calls.filter(([cmd])=>cmd==='click').length,0);
});
test('Mistral uses a verified generic editable ref and submits once with Enter, no tab mutation',async()=>{
 const home='https://chat.mistral.ai/work';
 const conv='https://chat.mistral.ai/work/'+conversation;
 const snapshot0={url:home,browserPageId:pageId,refs:{e8:{role:'generic',name:''}},snapshot:'- generic [ref=e8] editable [contenteditable]:'};
 const f=stub([['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
  ['snapshot',snapshot0],['fill',args=>{assert.ok(args.includes('e8'));return {ok:true}}],
  ['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],['keypress',{ok:true}],
  ['tab',{tabs:[tab(conv)]}],['eval',{url:conv,lastUserText:prompt,userCount:1,assistantText:'ACK',generationActive:false}]]);
 const x=await createOrcaCliTransport({...opts(f.run),provider:'mistral'}).trigger({question:prompt});
 assert.equal(x.status,'submitted');assert.ok(f.calls.every(([cmd])=>!['click','close','switch','create'].includes(cmd)));
});

test('Windows Claude editor may asynchronously reflect fill; poll the exact draft before permitting one send',async()=>{
 const home='https://claude.ai/new';const convo='https://claude.ai/chat/'+conversation;
 const snap=send=>({url:home,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Write your prompt to Claude'},...(send?{e2:{role:'button',name:'Send message'}}:{})}});
 const f=stub([['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['snapshot',snap(false)],['fill',{ok:true}],
 ['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],
 ['snapshot',snap(true)],['click',{ok:true}],
 ['tab',{tabs:[tab(convo)]}],['eval',{url:convo,lastUserText:prompt,userCount:1,assistantText:'ACK',generationActive:false}]]);
 const result=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.equal(result.status,'submitted');assert.equal(f.calls.filter(([cmd])=>cmd==='fill').length,1);assert.equal(f.calls.filter(([cmd])=>cmd==='click').length,1);
});
test('persistent post-fill integrity mismatch remains NOT_SENT and never clicks',async()=>{
 const home='https://claude.ai/new';const snap={url:home,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Write your prompt to Claude'}}};
 const f=stub([['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],['snapshot',snap],['fill',{ok:true}],
 ...Array.from({length:5},()=>['eval',{url:home,editorCount:1,editorText:'different draft',generationActive:false}])]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.equal(r.status,'not_sent');assert.equal(r.reason,'PROMPT_INTEGRITY_FAILED');assert.equal(f.calls.filter(([op])=>op==='click').length,0);
});

test('Windows Mistral navigation to fresh chat waits for empty composer before filling, no duplicate navigation',async()=>{
 const home='https://chat.mistral.ai/work',existing='https://chat.mistral.ai/work/'+conversation;
 const otherId='22222222-2222-4222-8222-222222222222',next='https://chat.mistral.ai/work/'+otherId;
 const snap={url:home,browserPageId:pageId,refs:{e8:{role:'generic',name:''}},snapshot:'- generic [ref=e8] editable [contenteditable]:'};
 const f=stub([['tab',{tabs:[tab(existing)]}],['eval',{url:existing,editorCount:1,editorText:'',generationActive:false}],
 ['goto',{ok:true}],['tab',{tabs:[tab(home)]}],
 ['eval',{url:home,editorCount:0,editorText:null,generationActive:false}],
 ['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['snapshot',snap],['fill',{ok:true}],['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],
 ['keypress',{ok:true}],['tab',{tabs:[tab(next)]}],['eval',{url:next,lastUserText:prompt,userCount:1,assistantText:'ACK',generationActive:false}]]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'mistral'}).trigger({question:prompt});
 assert.equal(r.status,'submitted');assert.equal(f.calls.filter(([c])=>c==='goto').length,1);
 assert.equal(f.calls.filter(([c])=>c==='keypress').length,1);
});
test('Mistral navigation never overwrites a persistent preexisting draft',async()=>{
 const home='https://chat.mistral.ai/work',existing='https://chat.mistral.ai/work/'+conversation;
 const f=stub([['tab',{tabs:[tab(existing)]}],['eval',{url:existing,editorCount:1,editorText:'',generationActive:false}],
 ['goto',{ok:true}],['tab',{tabs:[tab(home)]}],...Array.from({length:5},()=>['eval',{url:home,editorCount:1,editorText:'preexisting draft',generationActive:false}])]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'mistral'}).trigger({question:prompt});
 assert.deepEqual(r,{status:'not_sent',reason:'COMPOSER_NOT_EMPTY'});
 assert.equal(f.calls.filter(([c])=>['fill','keypress','click'].includes(c)).length,0);
});

test('false completion regression: text stable and Stop missing but no latest assistant terminal action stays PENDING',async()=>{
 const value={url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Partial answer paused before resuming',generationActive:false,generationComplete:false};
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',value]]);
 const out=await createOrcaCliTransport(opts(f.run)).collect({conversationId:conversation,conversationUrl:chatUrl,promptHash:sha(prompt)});
 assert.equal(out.status,'pending');assert.equal(f.calls.filter(([cmd])=>cmd==='eval').length,1);
});
test('latest assistant terminal action must be present in both snapshots and completion proof returned',async()=>{
 const value={url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Synthetic final answer',generationActive:false,generationComplete:true};
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',value],['eval',value]]);
 const out=await createOrcaCliTransport(opts(f.run)).collect({conversationId:conversation,conversationUrl:chatUrl,promptHash:sha(prompt)});
 assert.equal(out.status,'completed');assert.equal(out.completionEvidence,'latest-assistant-terminal-action-v1');
});
test('terminal action disappearing on second snapshot cannot be completed',async()=>{
 const v={url:chatUrl,lastUserText:prompt,userCount:1,assistantText:'Synthetic final answer',generationActive:false,generationComplete:true};
 const f=stub([['tab',{tabs:[tab(chatUrl)]}],['eval',v],['eval',{...v,generationComplete:false}]]);
 assert.equal((await createOrcaCliTransport(opts(f.run)).collect({conversationId:conversation,conversationUrl:chatUrl,promptHash:sha(prompt)})).status,'pending');
});

test('ChatGPT empty ProseMirror <p><br> exposes newline innerText but is not a user draft',async()=>{
 const {runInNewContext}=await import('node:vm');
 const ed={innerText:'\n',textContent:'',getClientRects:()=>[{}],querySelector:q=>q==='p > br'?{}:null};
 const document={querySelectorAll:q=>q.includes('contenteditable')?[ed]:[],querySelector:()=>null};
 const s=runInNewContext(ORCA_READONLY_INSPECT_JS,{document,location:{origin:'https://chatgpt.com',pathname:'/'}});
 assert.equal(s.editorText,'');
 ed.innerText=' ';ed.textContent=' ';
 const draft=runInNewContext(ORCA_READONLY_INSPECT_JS,{document,location:{origin:'https://chatgpt.com',pathname:'/'}});
 assert.equal(draft.editorText,' '); // Whitespace typed by a user is still a draft.
});

test('WSL Claude stale editor ref: failed fill with verified blank composer permits one fresh-ref fill, never double-send',async()=>{
 const home='https://claude.ai/new',old='https://claude.ai/chat/'+conversation;
 const next='https://claude.ai/chat/22222222-2222-4222-8222-222222222222';
 const snap=ref=>({url:home,browserPageId:pageId,refs:{[ref]:{role:'textbox',name:'Write your prompt to Claude'}}});
 const f=stub([['tab',{tabs:[tab(old)]}],['eval',{url:old,editorCount:1,editorText:'',generationActive:false}],
 ['goto',{ok:true}],['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['snapshot',snap('e1')],['fill',Error('ORCA_COMMAND_FAILED')],
 ['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],['snapshot',snap('e9')],
 ['fill',args=>{assert.ok(args.includes('e9'));return {ok:true}}],
 ['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],
 ['snapshot',{url:home,browserPageId:pageId,refs:{e9:{role:'textbox',name:'Write your prompt to Claude'},e11:{role:'button',name:'Send message'}}}],
 ['click',{ok:true}],['tab',{tabs:[tab(next)]}],['eval',{url:next,lastUserText:prompt,userCount:1,assistantText:'OK',generationActive:false}]]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.equal(r.status,'submitted');assert.equal(f.calls.filter(([op])=>op==='fill').length,2);
 assert.equal(f.calls.filter(([op])=>op==='click').length,1);
});

test('failed fill that leaves another draft never refills or submits',async()=>{
 const home='https://claude.ai/new';const snap={url:home,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Write your prompt to Claude'}}};
 const f=stub([['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['snapshot',snap],['fill',Error('ORCA_COMMAND_FAILED')],['eval',{url:home,editorCount:1,editorText:'unrelated content',generationActive:false}]]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.deepEqual(r,{status:'not_sent',reason:'PROMPT_INTEGRITY_FAILED'});
 assert.equal(f.calls.filter(([op])=>op==='fill').length,1);assert.equal(f.calls.filter(([op])=>op==='click').length,0);
});

test('failed fill with verified complete exact question proceeds without another fill',async()=>{
 const home='https://claude.ai/new',next='https://claude.ai/chat/'+conversation;
 const snap={url:home,browserPageId:pageId,refs:{e1:{role:'textbox',name:'Write your prompt to Claude'},e2:{role:'button',name:'Send message'}}};
 const f=stub([['tab',{tabs:[tab(home)]}],['eval',{url:home,editorCount:1,editorText:'',generationActive:false}],
 ['snapshot',snap],['fill',Error('ORCA_COMMAND_FAILED')],
 ['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],
 ['eval',{url:home,editorCount:1,editorText:prompt,generationActive:false}],
 ['snapshot',snap],['click',{ok:true}],['tab',{tabs:[tab(next)]}],
 ['eval',{url:next,lastUserText:prompt,userCount:1,assistantText:'OK',generationActive:false}]]);
 const r=await createOrcaCliTransport({...opts(f.run),provider:'claude'}).trigger({question:prompt});
 assert.equal(r.status,'submitted');assert.equal(f.calls.filter(([op])=>op==='fill').length,1);
 assert.equal(f.calls.filter(([op])=>op==='click').length,1);
});

test('native Orca runner isolates WSL bridge subprocess cwd from arbitrary Pi project cwd',async()=>{
 const os=await import('node:os');const {EventEmitter}=await import('node:events');
 const {createOrcaCommandRunner}=await import('./orca-cli.mjs');
 const spawnCalls=[];
 const spawnProcess=(exe,args,opts)=>{
  spawnCalls.push({exe,args,opts});
  const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.kill=()=>{};
  queueMicrotask(()=>{p.stdout.emit('data',Buffer.from(JSON.stringify({ok:true,result:{tabs:[]}})));p.emit('close',0)});
  return p;
 };
 const run=createOrcaCommandRunner({cli:'orca-ide',spawnProcess});
 const original=process.cwd();
 await run('tab',['list','--worktree','id:synthetic::test']);
 assert.equal(process.cwd(),original,'Pi project process cwd remains unchanged');
 assert.equal(spawnCalls[0].opts.cwd,os.homedir(),'subprocess uses stable user-local directory rather than inherited project cwd');
 assert.equal(spawnCalls[0].opts.shell,false);
});

test('ChatGPT ProseMirror multiline fill preserves original paragraph newlines for exact prompt integrity',async()=>{
 const {runInNewContext}=await import('node:vm');
 const exact='ProjectTag: SYNTHETIC\nGoal: Review tests\n\nOnly return the synthetic acknowledgement';
 const segments=['ProjectTag: SYNTHETIC','Goal: Review tests','','Only return the synthetic acknowledgement'];
 const nodes=segments.map(text=>({tagName:'P',textContent:text,childNodes:text?[{nodeType:3,textContent:text}]:[{nodeType:1,tagName:'BR',childNodes:[]}]}));
 const editor={innerText:segments.join('\n\n'),textContent:segments.join(''),children:nodes,getClientRects:()=>[{}],querySelector:()=>null};
 const document={querySelectorAll:s=>s.includes('contenteditable')?[editor]:[],querySelector:()=>null};
 const state=runInNewContext(ORCA_READONLY_INSPECT_JS,{document,location:{origin:'https://chatgpt.com',pathname:'/'}});
 assert.notEqual(editor.innerText,exact,'real DOM innerText adds extra paragraph newlines');
 assert.equal(state.editorText,exact,'canonical editor text must hash to the original question');
});
