import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import {resolveSemanticEditor} from "../dist/core/semantic-editor.js";

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
  console.log(JSON.stringify({status:"PASS",cases:out}));
} finally {await browser.close();}
