import {completionEvidenceExpression} from './completion-evidence.mjs';
// Pure, site-specific rules. No browser lifecycle or authentication ownership.
// All page scripts generated here inspect DOM only; no JS-driven send or click.
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ID=new RegExp('^(?:'+UUID+'|[A-Za-z0-9_-]{8,120})$','i');
export const WEB_PROVIDERS=Object.freeze({
 chatgpt:Object.freeze({id:'chatgpt',origin:'https://chatgpt.com',home:'https://chatgpt.com/',pathPrefix:'c',editorSelector:'[role="textbox"][contenteditable="true"]',sendMode:'click',snapshotInteractive:true}),
 claude:Object.freeze({id:'claude',origin:'https://claude.ai',home:'https://claude.ai/new',pathPrefix:'chat',editorSelector:'[data-testid="chat-input"][contenteditable="true"]',sendMode:'click',snapshotInteractive:true}),
 grok:Object.freeze({id:'grok',origin:'https://grok.com',home:'https://grok.com/',pathPrefix:'c',editorSelector:'form[data-composer="true"] [contenteditable="true"]',sendMode:'enter',snapshotInteractive:true}),
 mistral:Object.freeze({id:'mistral',origin:'https://chat.mistral.ai',home:'https://chat.mistral.ai/work',pathPrefix:'work',editorSelector:'form [contenteditable="true"].ProseMirror',sendMode:'enter',snapshotInteractive:false})
});
export function conversationIdFromUrl(provider,raw){
 const site=WEB_PROVIDERS[provider];if(!site||typeof raw!=='string')return null;
 try{
  const u=new URL(raw);
  if(u.origin!==site.origin||u.hash||u.username||u.password)return null;
  if(u.search){
   if(provider!=='grok'||u.searchParams.size!==1||!u.searchParams.has('rid')||
    !new RegExp('^'+UUID+'$','i').test(u.searchParams.get('rid')||''))return null;
  }
  const pieces=u.pathname.split('/').filter(Boolean);
  if(provider==='chatgpt'&&pieces.length===4&&pieces[0]==='g'&&/^g-p-[A-Za-z0-9_-]{1,120}$/.test(pieces[1])&&pieces[2]==='c')return ID.test(pieces[3])?pieces[3]:null;
  if(pieces.length!==2||pieces[0]!==site.pathPrefix)return null;
  return ID.test(pieces[1])?pieces[1]:null;
 }catch{return null}
}
export function validateConversation(provider,url,id){return typeof id==='string'&&conversationIdFromUrl(provider,url)===id}
export function canonicalPageUrl(provider,url){
 if(!isAllowedPage(provider,url))return null;
 const u=new URL(url);return u.origin+u.pathname;
}
export function isAllowedPage(provider,url){
 const site=WEB_PROVIDERS[provider];return !!site&&(url===site.home||conversationIdFromUrl(provider,url)!==null);
}
export function editorRefForSnapshot(provider,{refs={},snapshot=''}={}){
 if(!WEB_PROVIDERS[provider])return null;
 const hits=Object.entries(refs).filter(([ref,r])=>{
  if(provider==='mistral')return r?.role==='generic'&&new RegExp(`\\[ref=${ref}\\] editable \\[contenteditable\\]`).test(snapshot);
  if(provider==='grok')return r?.role==='combobox'||(r?.role==='textbox'&&/Grok/i.test(r?.name||''));
  if(provider==='claude')return r?.role==='textbox'&&/Claude/i.test(r?.name||'');
  return r?.role==='textbox';
 });
 return hits.length===1?hits[0][0]:null;
}
export function sendRefForSnapshot(provider,{refs={}}={}){
 const send=(name)=>/^(send|send message|傳送|傳送訊息|送出|发送|发送消息)(?:\s.*)?$/i.test(name||'');
 if(!['chatgpt','claude'].includes(provider))return null;
 const hits=Object.entries(refs).filter(([,r])=>r?.role==='button'&&send(r.name));
 return hits.length===1?hits[0][0]:null;
}
const siteDom={
 claude:{user:'[data-testid="user-message"],[data-is-user-message="true"],[data-testid="human-message"]',assistant:'[data-testid="assistant-message"]',stop:'button[aria-label*="Stop"],button[data-testid*="stop"]'},
 grok:{user:'[data-testid="user-message"],[data-testid="human-message"],[data-testid="user-query"]',assistant:'[data-testid="assistant-message"]',stop:'button[aria-label*="Stop"],button[aria-label*="停止"],button[data-testid*="stop"]'},
 mistral:{user:'[class*="group/message"] [class*="bg-basic-gray-alpha-4"]',assistant:'[data-message-part-type="answer"][data-testid="text-message-part"]',stop:'form button[aria-label*="Stop"],form button[aria-label*="Cancel"]'}
};
export const WEB_READONLY_INSPECT_JS=Object.fromEntries(Object.entries(siteDom).map(([provider,dom])=>{
 const site=WEB_PROVIDERS[provider];
 const js=`(() => {
 const editors=[...document.querySelectorAll(${JSON.stringify(site.editorSelector)})].filter(e=>e.getClientRects().length);
 const editor=editors.length===1?editors[0]:null;
 const userNodes=[...document.querySelectorAll(${JSON.stringify(dom.user)})].filter(e=>e.getClientRects().length);
 const assistantNodes=[...document.querySelectorAll(${JSON.stringify(dom.assistant)})].filter(e=>e.getClientRects().length);
 const text=e=>e?(typeof e.innerText==='string'?e.innerText.trim():null):null;
 const userRoot=userNodes.at(-1),answerRoot=assistantNodes.at(-1);
 const latestUser=text(${JSON.stringify(provider)}==='grok'?userRoot?.querySelector('.response-content-markdown')??null:userRoot);
 const latestAssistant=text(${JSON.stringify(provider)}==='claude'?(answerRoot?.querySelector('.prose')??null):
  ${JSON.stringify(provider)}==='grok'?(answerRoot?.querySelector('.response-content-markdown')??null):answerRoot);
 // Claude, Grok and Mistral wrap each logical editor line in a <p>. innerText
 // inserts visual blank lines between paragraphs, even when the original
 // exact prompt contained one newline. Reconstruct from DOM, not a broad
 // whitespace-replacement that could silently change the user's question.
 const isParagraphEditor=['claude','grok','mistral'].includes(${JSON.stringify(provider)})&&
  !!editor?.children?.length&&[...editor.children].every(x=>x.tagName==='P');
 const paragraphText=node=>{
  if(!node?.childNodes)return node?.textContent??'';
  if(node.childNodes.length===1&&node.childNodes[0].tagName==='BR')return '';
  const walk=x=>x.nodeType===3?(x.textContent??''):x.tagName==='BR'?'\\n':
   [...(x.childNodes||[])].map(walk).join('');
  return [...node.childNodes].map(walk).join('');
 };
 // Mistral renders already-sent user messages as paragraph DOM as well.
 // Read-only recovery must hash the original logical question, not visual
 // innerText spacing, or a successful Enter is incorrectly left UNKNOWN.
 const sentUserParagraphs=${JSON.stringify(provider)}==='mistral'&&
  typeof userRoot?.querySelectorAll==='function'?[...userRoot.querySelectorAll('p')]:[];
 const latestUserText=sentUserParagraphs.length?
  sentUserParagraphs.map(paragraphText).join('\\n'):latestUser;
 const editorText=editor?(isParagraphEditor?[...editor.children].map(paragraphText).join('\\n'):
  (editor.innerText||editor.value||'').trim()):null;
 return {url:location.origin+location.pathname,editorCount:editors.length,editorText,
  lastUserText:latestUserText,userCount:userNodes.length,assistantText:latestAssistant,
  generationActive:!!document.querySelector(${JSON.stringify(dom.stop)}),
  generationComplete:${completionEvidenceExpression(provider)}};
})()`;
 return [provider,js];
}));
