// Dedicated, page-bound Orca CLI transport for standalone Pi. Never closes,
// creates, switches, or changes the profile of another Orca browser tab.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {WEB_PROVIDERS,WEB_READONLY_INSPECT_JS,isAllowedPage,canonicalPageUrl,conversationIdFromUrl,validateConversation,editorRefForSnapshot,sendRefForSnapshot} from './web-providers.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const sha=text=>createHash('sha256').update(text).digest('hex');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(Error('ORCA_ABORTED'));let timer;const onAbort=()=>{clearTimeout(timer);reject(Error('ORCA_ABORTED'))};timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve()},ms);signal?.addEventListener('abort',onAbort,{once:true})});
// Exactly one JSON Orca result; never log argv, stdin, prompts, stdout, or raw errors.
export function createOrcaCommandRunner({cli='orca-ide',spawnProcess=spawn,timeoutMs=25000}={}){
 if(typeof cli!=='string'||!cli||cli.includes('\n')||cli.includes('\r'))throw Error('INVALID_ORCA_CLI');
 return (command,args=[],signal)=>new Promise((resolve,reject)=>{
  if(!['tab','snapshot','eval','fill','click','goto','keypress'].includes(command))return reject(Error('ORCA_COMMAND_DENIED'));
  if(command==='tab'&&args[0]!=='list')return reject(Error('ORCA_TAB_MUTATION_DENIED'));
  const child=spawnProcess(cli,[command,...args,'--json'],{stdio:['ignore','pipe','pipe'],shell:false});
  let out='',errBytes=0,settled=false,closed=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){if(!closed)child.kill('SIGTERM');reject(error)}else resolve(value)};
  const abort=()=>finish(Error('ORCA_ABORTED'));
  const timer=setTimeout(()=>finish(Error('ORCA_TIMEOUT')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',chunk=>{out+=chunk.toString('utf8');if(out.length>500000)finish(Error('ORCA_OUTPUT_LIMIT'))});
  child.stderr.on('data',chunk=>{errBytes+=chunk.length;if(errBytes>16000)finish(Error('ORCA_STDERR_LIMIT'))});
  child.on('error',()=>finish(Error('ORCA_CLI_UNAVAILABLE')));
  child.on('close',code=>{
   closed=true;if(code!==0)return finish(Error('ORCA_COMMAND_FAILED'));
   try{const x=JSON.parse(out);if(x.ok!==true||!x.result||typeof x.result!=='object')throw Error();finish(null,x.result)}
   catch{finish(Error('ORCA_INVALID_RESULT'))}
  });
  if(signal?.aborted)abort();
 });
}

// Browser DOM is read-only through Orca eval; no click/fill/navigation via JS.
// Read only the newest visible user/assistant turn, the editor and generation state.
export const ORCA_READONLY_INSPECT_JS=`(() => {
 const editors=[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].filter(x=>x.getClientRects().length);
 const editor=editors.length===1?editors[0]:null;
 const all=[...document.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"]')];
 const users=all.filter(x=>x.getAttribute('data-message-author-role')==='user');
 const assistants=all.filter(x=>x.getAttribute('data-message-author-role')==='assistant');
 const lastUser=users.at(-1),lastAssistant=assistants.at(-1);
 // ChatGPT's newer accessible conversation renderer uses headings instead of
 // data-message-author-role attributes. Extract only the sibling content of
 // the role heading, never a whole conversation region containing other turns.
 const headings=[...document.querySelectorAll('h4')];
 const headingText=(pattern)=>{
  const h=headings.filter(x=>pattern.test(x.innerText.trim())).at(-1);
  return h?.parentElement?.children?.[1]?.innerText??null;
 };
 const userText=lastUser?(lastUser.querySelector('.whitespace-pre-wrap')||lastUser).innerText:
  headingText(/^(?:你說：?|你说：?|You said:?)$/i);
 const answer=lastAssistant?(lastAssistant.querySelector('.markdown')||lastAssistant).innerText:
  headingText(/^(?:ChatGPT 說：?|ChatGPT 说：?|ChatGPT said:?)$/i);
 const userCount=users.length||headings.filter(x=>/^(?:你說：?|你说：?|You said:?)$/i.test(x.innerText.trim())).length;
 return {url:location.origin+location.pathname,editorCount:editors.length,editorText:editor?editor.innerText:null,
  lastUserText:userText,userCount,assistantText:answer,
  generationActive:!!document.querySelector('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]')};
})()`;

function normalizeState(raw,provider){
 const x=typeof raw?.result==='string'?JSON.parse(raw.result):raw;
 if(!x||typeof x!=='object'||!isAllowedPage(provider,x.url))throw Error('ORCA_INVALID_PAGE_STATE');
 return x;
}
const fullArgs=(worktree,pageId)=>['--worktree',worktree,'--page',pageId];

export function createOrcaCliTransport({cli='orca-ide',worktree,pageId,provider='chatgpt',run=createOrcaCommandRunner({cli}),settleMs=650}={}){
 const site=WEB_PROVIDERS[provider];if(!site)throw Error('UNKNOWN_WEB_PROVIDER');
 if(typeof worktree!=='string'||!(/^(id|name):[^\r\n]{6,240}$/.test(worktree)))throw Error('INVALID_ORCA_WORKTREE');
 if(!UUID.test(pageId||''))throw Error('INVALID_ORCA_PAGE_ID');
 if(!Number.isFinite(settleMs)||settleMs<0)throw Error('INVALID_SETTLE_MS');
 const pinned=fullArgs(worktree,pageId);
 const exec=(cmd,args=[],signal)=>run(cmd,args,signal);
 async function tab(signal){
  const result=await exec('tab',['list','--worktree',worktree],signal);
  const pages=result?.tabs;
  if(!Array.isArray(pages))throw Error('ORCA_INVALID_TAB_LIST');
  const found=pages.filter(x=>x.browserPageId===pageId);
  if(found.length!==1||!isAllowedPage(provider,found[0].url))throw Error('ORCA_TARGET_MISMATCH');
  if(worktree.startsWith('id:')&&found[0].worktreeId!==worktree.slice(3))throw Error('ORCA_WORKTREE_MISMATCH');
  return found[0];
 }
 async function inspect(url,signal){
  const r=await exec('eval',['--expression',provider==='chatgpt'?ORCA_READONLY_INSPECT_JS:WEB_READONLY_INSPECT_JS[provider],...pinned,'--expect-url',url],signal);
  const state=normalizeState(r,provider);
  if(state.url!==canonicalPageUrl(provider,url))throw Error('ORCA_URL_CHANGED');
  return state;
 }
 async function snapshot(url,signal){
  const r=await exec('snapshot',[...(site.snapshotInteractive?['--interactive']:[]),...pinned],signal);
  if(r.browserPageId!==pageId||r.url!==url||!r.refs||typeof r.refs!=='object')throw Error('ORCA_SNAPSHOT_TARGET_MISMATCH');
  return r;
 }
 function editorRef(s){return editorRefForSnapshot(provider,s)}
 function sendRef(s){return sendRefForSnapshot(provider,s)}
 async function readiness(signal){
  try{
   const t=await tab(signal);const s=await snapshot(t.url,signal);
   return editorRef(s)!==null;
  }catch{return false}
 }
 async function recover({promptHash},signal){
  if(!SHA.test(promptHash||''))return {status:'unknown',reason:'INVALID_HASH'};
  try{
   const t=await tab(signal),conversationId=conversationIdFromUrl(provider,t.url);
   if(!conversationId)return {status:'unknown',reason:'NO_CONVERSATION_ID'};
   const observed=await inspect(t.url,signal);
   if(observed.userCount<1||typeof observed.lastUserText!=='string'||sha(observed.lastUserText)!==promptHash)
    return {status:'unknown',reason:'ORIGINAL_PROMPT_NOT_VERIFIED'};
   return {status:'submitted',conversationId,conversationUrl:canonicalPageUrl(provider,t.url)};
  }catch{return {status:'unknown',reason:'READ_ONLY_RECOVERY_FAILED'}}
 }
 async function verifyAfterClick(promptHash,signal){
  for(let i=0;i<12;i++){
   const r=await recover({promptHash},signal);
   if(r.status==='submitted')return r;
   if(signal?.aborted)break;
   if(i<11)await sleep(Math.min(500,settleMs),signal);
  }
  return {status:'unknown',reason:'POST_CLICK_UNVERIFIED'};
 }
 async function trigger({question},signal){
  let clicked=false;
  try{
   let t=await tab(signal),url=t.url;
   let state=await inspect(url,signal);
   if(state.editorCount!==undefined&&state.editorCount!==1)return {status:'not_sent',reason:'COMPOSER_UNAVAILABLE'};
   if(typeof state.editorText!=='string')return {status:'not_sent',reason:'COMPOSER_UNAVAILABLE'};
   if(state.editorText.trim())return {status:'not_sent',reason:'DRAFT_PRESENT'};
   if(state.generationActive)return {status:'not_sent',reason:'GENERATION_ACTIVE'};
   if(url!==site.home){
    // Only this pinned, dedicated page may navigate; other Orca tabs are never touched.
    await exec('goto',['--url',site.home,...pinned,'--expect-url',url],signal);
    t=await tab(signal);url=t.url;
    if(url!==site.home)return {status:'not_sent',reason:'NEW_CHAT_UNAVAILABLE'};
    state=await inspect(url,signal);
    if(state.editorText?.trim()||state.generationActive||state.editorCount!==1)return {status:'not_sent',reason:'COMPOSER_NOT_EMPTY'};
   }
   const s=await snapshot(url,signal);
   const editor=editorRef(s);
   if(!editor)return {status:'not_sent',reason:'COMPOSER_UNAVAILABLE'};
   await exec('fill',['--element',editor,'--value',question,...pinned,'--expect-url',url],signal);
   state=await inspect(url,signal);
   if(state.editorText!==question)return {status:'not_sent',reason:'PROMPT_INTEGRITY_FAILED'};
   let send=null;
   if(site.sendMode==='click'){
    for(let i=0;i<5;i++){
     const after=await snapshot(url,signal);send=sendRef(after);
     if(send)break;
     if(i<4)await sleep(Math.max(100,Math.min(settleMs,500)),signal);
    }
    if(!send)return {status:'not_sent',reason:'SEND_CONTROL_UNAVAILABLE'};
   }
   // After this point a failure is ambiguous. Never submit twice.
   clicked=true;
   if(site.sendMode==='enter')await exec('keypress',['--key','Enter',...pinned,'--expect-url',url],signal);
   else await exec('click',['--element',send,...pinned,'--expect-url',url],signal);
   // A successful click is NOT sufficient. Only read the pinned page to prove
   // the original user turn; never click again if navigation races the CLI.
   return await verifyAfterClick(sha(question),signal);
  }catch{
   if(!clicked)return {status:'not_sent',reason:'BEFORE_CLICK_FAILED'};
   try{return await verifyAfterClick(sha(question),signal)}
   catch{return {status:'unknown',reason:'CLICK_OUTCOME_UNKNOWN'}}
  }
 }

 async function collect({conversationId,conversationUrl,promptHash},signal){
  if(!UUID.test(conversationId||'')||conversationIdFromUrl(provider,conversationUrl)!==conversationId||!SHA.test(promptHash||''))return {status:'unknown'};
  try{
   const t=await tab(signal);
   // Never silently change another active conversation or other Orca tab.
   if(canonicalPageUrl(provider,t.url)!==conversationUrl)return {status:'pending',reason:'TARGET_NOT_CURRENT'};
   const s=await inspect(t.url,signal);
   if(typeof s.lastUserText!=='string'||sha(s.lastUserText)!==promptHash)return {status:'unknown',reason:'ORIGINAL_PROMPT_MISMATCH'};
   if(s.generationActive||typeof s.assistantText!=='string'||!s.assistantText.trim())return {status:'pending'};
   if(settleMs)await sleep(settleMs,signal);
   const s2=await inspect(t.url,signal);
   if(s2.generationActive||s2.lastUserText!==s.lastUserText||s2.assistantText!==s.assistantText)return {status:'pending'};
   return {status:'completed',conversationId,conversationUrl,text:s2.assistantText};
  }catch{return {status:'pending',reason:'COLLECT_UNAVAILABLE'}}
 }
 return {readiness,trigger,collect,recover};
}

// Per-Pi Orca transport lock. We never use the Browser Harness shared lock:
// different browser engines have independent process ownership.
export function withOrcaLock(lockFile,fn,{spawnProcess=spawn,signal}={}){
 if(!path.isAbsolute(lockFile||''))throw Error('INVALID_ORCA_LOCK');
 return new Promise((resolve,reject)=>{
  const child=spawnProcess('flock',['-x','-w','90',lockFile,'sh','-c','echo __PI_ORCA_LOCK__; cat >/dev/null'],{stdio:['pipe','pipe','pipe']});
  let ready=false,done=false;
  const timer=setTimeout(()=>finish(Error('ORCA_LOCK_TIMEOUT')),95000);
  const onAbort=()=>{if(!ready)finish(Error('ORCA_LOCK_ABORTED'))};
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);child.stdin.end();if(error)reject(error);else resolve(value)}
  signal?.addEventListener('abort',onAbort,{once:true});
  child.stdout.on('data',chunk=>{
   if(ready||!String(chunk).includes('__PI_ORCA_LOCK__'))return;
   ready=true;
   if(signal?.aborted)return onAbort();
   Promise.resolve().then(fn).then(v=>finish(null,v),e=>finish(e));
  });
  child.on('error',()=>finish(Error('ORCA_LOCK_UNAVAILABLE')));
  child.on('exit',()=>{if(!ready)finish(Error('ORCA_LOCK_UNAVAILABLE'))});
  if(signal?.aborted)onAbort();
 });
}
