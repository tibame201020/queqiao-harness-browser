// Read-only, per-provider completion evidence from live Orca DOM POC.
// These selectors are tied to the latest assistant message, not the page.
export const COMPLETION_PROOF='latest-assistant-terminal-action-v1';
const SITES=new Set(['chatgpt','claude','grok','mistral']);
export function completionEvidenceExpression(provider){
 if(!SITES.has(provider))throw Error('UNKNOWN_COMPLETION_PROVIDER');
 return `(() => {
 const provider=${JSON.stringify(provider)};
 const visible=e=>!!e&&(!e.getClientRects||e.getClientRects().length>0);
 const responseButtons=e=>[...e?.querySelectorAll?.('button')??[]].filter(visible);
 const named=(b,rule)=>rule.test((b.getAttribute('aria-label')||b.getAttribute('title')||b.getAttribute('data-testid')||'').trim());
 const match=e=>responseButtons(e).some(b=>named(b,provider==='chatgpt'?/^(重新產生回覆|Regenerate response|Try again)$/i:
  provider==='claude'?/^(Retry|Try again)$/i:
  provider==='grok'?/^(重新生成|Regenerate|Retry)$/i:
  /^(Read aloud|朗讀)$/i));
 const visibleLast=s=>[...document.querySelectorAll(s)].filter(visible).at(-1)||null;
 const lastInScope=(parent,selector)=>parent?.querySelectorAll?.(selector)?.length===1;
 if(provider==='claude')return match(visibleLast('[data-testid=assistant-message]'));
 if(provider==='grok'){
  const root=visibleLast('[data-testid=assistant-message]');
  const parent=root?.parentElement;
  return !!root&&lastInScope(parent,'[data-testid=assistant-message]')&&match(parent);
 }
 if(provider==='mistral'){
  const root=visibleLast('[data-message-part-type=answer][data-testid=text-message-part]');
  if(!root)return false;
  let current=root;
  for(let depth=0;depth<=5&&current;depth++,current=current.parentElement){
   if(lastInScope(current,'[data-message-part-type=answer][data-testid=text-message-part]')&&match(current))return true;
  }
  return false;
 }
 const headings=[...document.querySelectorAll('h4')].filter(x=>/^(ChatGPT (說|说|said)[:：]?)$/i.test((x.innerText||'').trim()));
 const latest=headings.at(-1)||visibleLast('[data-message-author-role=assistant]');
 if(!latest)return false;
 let current=latest;
 for(let depth=0;depth<=6&&current;depth++,current=current.parentElement){
  const headingCount=[...(current.querySelectorAll?.('h4')??[])].filter(x=>/^(ChatGPT (說|说|said)[:：]?)$/i.test((x.innerText||'').trim())).length;
  const roleCount=(current.querySelectorAll?.('[data-message-author-role=assistant]')??[]).length;
  // Never borrow a Regenerate button from another assistant turn.
  if(headingCount>1||roleCount>1)break;
  if(match(current))return true;
 }
 return false;
})()`;
}
