import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {chatgptAdapter} from "../dist/adapters/chatgpt-adapter.js";
const id="11111111-1111-4111-8111-111111111111", prompt="ISSUE32_SYNTHETIC_READONLY";
let phase="forbidden", sends=0;
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const context=await browser.newContext();
 await context.route("**/*",async route=>{
  if(route.request().method()!=="GET")sends++;
  const body=phase==="challenge"?"<title>Just a moment...</title>":`<title>ChatGPT</title><div data-user-message-bubble="true"><div class="whitespace-pre-wrap">OLD</div></div><div id="prompt-textarea" role="textbox" contenteditable="true"></div>`;
  await route.fulfill({status:phase==="forbidden"?403:200,contentType:"text/html",body});
 });
 const page=await context.newPage();
 for(const [p,status,reason] of [["forbidden","unavailable","NAVIGATION_HTTP_ERROR"],["challenge","unavailable","SITE_CHALLENGE"],["normal","pending",undefined]]){
  phase=p;
  const r=await chatgptAdapter.execute("resume",{conversationId:id,prompt,baseline:{bubbles:1,legacy:0}},{browser:{page}});
  assert.equal(r.status,status,`${p} status: ${JSON.stringify(r)}`);
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.submissionState,"unknown");
  assert.equal(sends,0);
  console.log("PASS",p,r.status,r.reason??"no-new-turn");
 }
 await page.close();
 assert.equal(sends,0);
 console.log("ISSUE32_REAL_CHROMIUM_SYNTHETIC_PASS");
}finally{await browser.close();}
