import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {completionEvidenceExpression,COMPLETION_PROOF} from './completion-evidence.mjs';

function tree(){
 const nodes=[];
 const add=(tag,{label='',name='',testid='',visible=true,role='',text=''}={},parent=null)=>{
  const e={tagName:tag.toUpperCase(),innerText:text,parentElement:parent,children:[],
   getClientRects(){return visible?[{}]:[]},
   getAttribute(k){return ({'aria-label':label,title:name,'data-testid':testid,'data-message-author-role':role})[k]??null},
   querySelectorAll(q){const all=[];function visit(n){for(const x of n.children){if(select(x,q))all.push(x);visit(x)}}visit(this);return all}
  };if(parent)parent.children.push(e);nodes.push(e);return e;
 };
 function select(e,s){if(s==='h4')return e.tagName==='H4';if(s==='button')return e.tagName==='BUTTON';if(s.includes('data-message-author-role=assistant'))return e.getAttribute('data-message-author-role')==='assistant';if(s.includes('data-testid=assistant-message'))return e.getAttribute('data-testid')==='assistant-message';if(s.includes('data-message-part-type=answer'))return e.getAttribute('data-testid')==='text-message-part';return false}
 const doc={querySelectorAll:q=>nodes.filter(e=>select(e,q))};
 const evaluate=p=>runInNewContext(completionEvidenceExpression(p),{document:doc});
 return {add,doc,evaluate};
}
test('proof identifier is explicit, versioned and portable',()=>assert.equal(COMPLETION_PROOF,'latest-assistant-terminal-action-v1'));
test('ChatGPT: previous completed turn never marks latest streaming turn complete',()=>{
 const t=tree();const old=t.add('div'),old4=t.add('div',{},old),old3=t.add('div',{},old4),old2=t.add('div',{},old3),old1=t.add('div',{},old2);
 t.add('h4',{text:'ChatGPT 說：'},old1);t.add('button',{label:'重新產生回覆'},old4);
 const latest=t.add('div'),a=t.add('div',{},latest),b=t.add('div',{},a),c=t.add('div',{},b),d=t.add('div',{},c);
 t.add('h4',{text:'ChatGPT 說：'},d);
 assert.equal(t.evaluate('chatgpt'),false);
 t.add('button',{label:'重新產生回覆'},latest);
 assert.equal(t.evaluate('chatgpt'),true);
});
test('Claude: Copy and text do not prove terminal; response-scoped Retry does',()=>{
 const t=tree(),root=t.add('div',{testid:'assistant-message'});t.add('button',{label:'Copy'},root);
 assert.equal(t.evaluate('claude'),false);t.add('button',{label:'Retry'},root);assert.equal(t.evaluate('claude'),true);
});
test('Grok: early Copy response is not terminal; latest reply Regenerate is',()=>{
 const t=tree(),wrap=t.add('div'),root=t.add('div',{testid:'assistant-message'},wrap);t.add('button',{label:'複製回應'},wrap);
 assert.equal(t.evaluate('grok'),false);t.add('button',{label:'重新生成'},wrap);assert.equal(t.evaluate('grok'),true);
});
test('Mistral: early Rewrite is not terminal; latest reply Read aloud is',()=>{
 const t=tree(),p4=t.add('div'),p3=t.add('div',{},p4),p2=t.add('div',{},p3),p1=t.add('div',{},p2),answer=t.add('div',{testid:'text-message-part'},p1);
 t.add('button',{label:'Rewrite'},p4);assert.equal(t.evaluate('mistral'),false);
 t.add('button',{label:'Read aloud'},p4);assert.equal(t.evaluate('mistral'),true);
});
test('toolbars outside latest response cannot cause false completion',()=>{
 for(const p of ['claude','grok','mistral']){const t=tree();const outer=t.add('div');t.add('button',{label:p==='mistral'?'Read aloud':p==='grok'?'重新生成':'Retry'},outer);assert.equal(t.evaluate(p),false)}
});
