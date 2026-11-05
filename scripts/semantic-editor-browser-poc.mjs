import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import {resolveSemanticEditor} from "../dist/core/semantic-editor.js";
import {resolveChatGptComposer} from "../dist/adapters/chatgpt-composer-resolver.js";

const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  const page=await browser.newPage();
  const cases=[
    {name:"grok-like",role:"combobox",send:'button[data-testid="chat-submit"][type="submit"]'},
    {name:"mistral-like",role:"textbox",send:'button[aria-label="Send"][type="submit"]'},
  ];
  const out=[];
  for(const item of cases){
    const sendButton=item.name==="grok-like" ? '<button type="submit" data-testid="chat-submit">Send</button>' : '<button type="submit" aria-label="Send">Send</button>';
    await page.setContent(`<main><form id="active"><div id="old" role="${item.role}" contenteditable="true" aria-label="Composer"></div>${sendButton}</form></main>`);
    await page.evaluate(()=>{document.querySelector("#old").outerHTML='<div id="replacement" role="'+document.querySelector("#old").getAttribute("role")+'" contenteditable="true" aria-label="Composer"></div>'});
    const contract={css:"#old:visible",roles:[item.role],sendWithinForm:item.send};
    const ready=await resolveSemanticEditor(page,contract);
    assert.equal(ready.source,"aria");
    assert.equal(ready.matches,1);
    await page.locator("#replacement").evaluate(node=>node.setAttribute("contenteditable","false"));
    const readonly=await resolveSemanticEditor(page,contract);
    assert.equal(readonly.editor,null);
    await page.locator("#replacement").evaluate(node=>node.removeAttribute("contenteditable"));
    await page.locator("#replacement").evaluate(node=>node.setAttribute("contenteditable","true"));
    await page.locator("#active").evaluate(node=>node.insertAdjacentHTML("beforeend",'<button type="submit" aria-label="Send" data-testid="chat-submit">Send</button>'));
    const duplicate=await resolveSemanticEditor(page,contract);
    assert.equal(duplicate.editor,null);
    out.push({case:item.name,selectorDriftRecovered:true,noneditableRejected:true,duplicateSendRejected:true});
  }
  // Independent review P1: a new earlier matching textbox must not steal focus.
  await page.setContent(`<main><form id="original"><div role="textbox" contenteditable="true">ORIGINAL_DRAFT</div><button type="submit">Send</button></form></main>`);
  const strict=await resolveSemanticEditor(page,{css:"#nonexistent",roles:["textbox"],sendWithinForm:"button[type=submit]"});
  assert.equal(strict.source,"aria");
  await page.evaluate(()=>document.body.insertAdjacentHTML("afterbegin",`<form id="injected"><div role="textbox" contenteditable="true">OTHER_DRAFT</div><button type="submit">Send</button></form>`));
  let rejected=false;
  try {await strict.editor.fill("SHOULD_NOT_SEND",{timeout:500});} catch {rejected=true;}
  assert.equal(rejected,true,"A recovered editor must stay strict after a second candidate appears");
  assert.equal(await page.locator("#original [role=textbox]").innerText(),"ORIGINAL_DRAFT");
  assert.equal(await page.locator("#injected [role=textbox]").innerText(),"OTHER_DRAFT");
  // ChatGPT-like lifecycle: after dispatch, Send becomes Stop while editor remains empty.
  await page.setContent(`<form><div role="textbox" contenteditable=""></div><button data-testid="send-button" type="button">Send</button></form>`);
  const preSend=await resolveChatGptComposer(page);
  assert.equal(preSend.source,"aria");
  await page.locator("button").evaluate(node => {node.dataset.testid="stop-button";node.textContent="Stop";});
  const rejectedAsPreSend=await resolveChatGptComposer(page);
  const observedAfterSend=await resolveChatGptComposer(page,{observationOnly:true});
  assert.equal(rejectedAsPreSend.composer,null);
  assert.equal(observedAfterSend.source,"aria");
  assert.equal(await observedAfterSend.composer.innerText(),"");
  console.log(JSON.stringify({status:"PASS",cases:out,lateDuplicateEditor:{rejected,originalDraftPreserved:true,otherDraftPreserved:true},postclickStop:{presendRejected:true,postclickObserved:true}}));
} finally {await browser.close();}
