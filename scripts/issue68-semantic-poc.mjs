import { chromium } from "playwright-core";
import { resolveChatGptComposer } from "../dist/adapters/chatgpt-composer-resolver.js";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const port = 19000 + Math.floor(Math.random() * 1000);
let browser;
const html = `<!doctype html><html><body>
<h1>Fixture</h1>
<form id="shell"><div id="changing-1" class="old" role="textbox" contenteditable="true" aria-label="Message composer"></div>
<button id="send-1" type="button" data-testid="send-button" aria-label="Send message" onclick="window.sent=(window.sent||0)+1">Send</button></form>
<script>window.remount=()=>{document.querySelector('#shell').innerHTML='<div id="changing-2" class="new" role="textbox" contenteditable="" aria-label="Message composer"></div><button id="send-2" type="button" data-testid="send-button" aria-label="Send message" onclick="window.sent=(window.sent||0)+1">Send</button>'};</script>
</body></html>`;
const runAgent = (...args) => execFileSync("cmd.exe", ["/d", "/s", "/c", "npx", "--yes", "agent-browser@0.41.2", "--session", "issue68ax" + port, "--cdp", String(port), ...args], { encoding: "utf8", timeout: 30000, windowsHide: true }).trim();
try {
  browser = await chromium.launch({ channel:"chrome", headless:true, args:[`--remote-debugging-port=${port}`] });
  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = await context.newPage();
  await page.goto("data:text/html," + encodeURIComponent(html));
  const oldCss = page.locator("#changing-1");
  const role = page.getByRole("textbox", { name:"Message composer" });
  const nativeBefore = (await role.count()) === 1;
  const axJsonBefore = await page.locator("body").ariaSnapshotJSON({ mode:"ai" });
  const agentBefore = runAgent("snapshot", "-i");
  await page.evaluate(() => window.remount());
  const oldGone = (await oldCss.count()) === 0;
  const roleRecovered = (await role.count()) === 1 && await role.isEditable();
  const existingCssMissed = await page.locator('#prompt-textarea:visible, [role="textbox"][contenteditable="true"]:visible').count() === 0;
  const integrated = await resolveChatGptComposer(page);
  const integratedFallbackRecovered = integrated.source === "aria" && integrated.matches === 1 && !!integrated.composer;
  const axJsonAfter = await page.locator("body").ariaSnapshotJSON({ mode:"ai" });
  const jsonHasRefs = JSON.stringify(axJsonAfter).includes('"ref"');
  const agentSnapshot = runAgent("snapshot", "-i");
  const agentHasComposer = /Message composer/.test(agentSnapshot);
  const agentHasSend = /Send message/.test(agentSnapshot);
  const axClient = await context.newCDPSession(page);
  const nativeAx = await axClient.send("Accessibility.getFullAXTree");
  await axClient.detach();
  const cdpaRoleFound = nativeAx.nodes.some(node => /textbox/i.test(String(node.role?.value ?? "")));
  const sendLine = agentSnapshot.split("\n").find(x => /Send message/.test(x)) ?? "";
  const ref = sendLine.match(/ref=(e[0-9]+)/)?.[1] ?? null;
  const clicked = ref ? runAgent("click", "@" + ref) : null;
  const sent = await page.evaluate(() => window.sent ?? 0);
  await page.evaluate(() => { document.querySelector("#changing-2").setAttribute("contenteditable", "false"); });
  const noneditableCount = await role.count();
  const locatorReportsEditable = noneditableCount === 1 ? await role.isEditable() : false;
  const nativeReportsContentEditable = await page.locator("#changing-2").evaluate(node => node.isContentEditable);
  const noneditableFailsClosed = noneditableCount !== 1 || !nativeReportsContentEditable;
  const integratedReadonlyRejected = (await resolveChatGptComposer(page)).source === "none";
  await page.evaluate(() => { document.querySelector("#changing-2").remove(); });
  const missingFailsClosed = (await role.count()) === 0;
  await page.evaluate(() => { document.querySelector("#shell").insertAdjacentHTML("beforeend", '<div role="textbox" aria-label="Message composer" contenteditable="true"></div><div role="textbox" aria-label="Message composer" contenteditable="true"></div>'); });
  const duplicateFailsClosed = (await role.count()) === 2;
  const duplicated = await resolveChatGptComposer(page);
  const integratedDuplicateRejected = duplicated.composer === null;
  const result = { integratedResolver: {existingCssMissed,integratedFallbackRecovered,integratedReadonlyRejected,integratedDuplicateRejected}, playwright: {nativeBefore,oldGone,roleRecovered,ariaJsonSupported:!!axJsonBefore,refPresent:jsonHasRefs}, cdp: {textBoxRole:cdpaRoleFound}, agentBrowser: {snapshotSucceeded:true,agentHasComposer,agentHasSend,refsBefore:/ref=e[0-9]+/.test(agentBefore),refResolved:!!ref,clickSucceeded:clicked!==null,sentExactlyOnce:sent===1}, failClosed: {noneditableFailsClosed,missingFailsClosed,duplicateFailsClosed,locatorReportsEditable,nativeReportsContentEditable} };
  assert(nativeBefore && oldGone && roleRecovered && axJsonBefore && axJsonAfter);
  if (!(existingCssMissed && integratedFallbackRecovered && integratedReadonlyRejected && integratedDuplicateRejected)) console.log(JSON.stringify({integratedDebug:{existingCssMissed,integratedFallbackRecovered,integratedReadonlyRejected,integratedDuplicateRejected,source:integrated.source}}));
  assert(existingCssMissed && integratedFallbackRecovered && integratedReadonlyRejected && integratedDuplicateRejected);
  assert(agentHasComposer && agentHasSend && ref && sent === 1);
  if (!(cdpaRoleFound && noneditableFailsClosed && missingFailsClosed && duplicateFailsClosed)) console.log(JSON.stringify({diagnostic:result}));
  assert(cdpaRoleFound && noneditableFailsClosed && missingFailsClosed && duplicateFailsClosed);
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(JSON.stringify({status:"experiment_failed",errorType:e?.name ?? "unknown",errorMessage:String(e?.message ?? e).slice(0,500)}));
  process.exitCode=1;
} finally {
  try { runAgent("close"); } catch { /* Chrome is separately owned by Playwright. */ }
  await browser?.close().catch(()=>{});
}
