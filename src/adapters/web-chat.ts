import { z } from "zod";
import type { Page } from "playwright-core";
import type { BrowserSession } from "../core/session.js";
import type { HarnessAdapter } from "./types.js";

export type WebChatSite = {
  id: "claude" | "mistral" | "grok";
  origin: string;
  bootstrapUrl: string;
  newChatUrl: string;
  conversationPaths: readonly string[];
  editor: string;
  send: string;
  assistant: string;
  stop: string;
  working?: string;
  login: string;
  loading: string;
  loadError: string;
  connectorPicker: string;
  connectorOption: string;
  connectorSelected: string;
};

const configSchema = z.object({
  conversation: z.object({newChatEachRun: z.literal(true).default(true)}).strict().default({newChatEachRun:true}),
  connector: z.object({
    strategy: z.enum(["preconnected", "picker"]).default("preconnected"),
    name: z.string().min(1).max(80).default("Queqiao"),
  }).strict().default({strategy:"preconnected",name:"Queqiao"}),
  trigger: z.object({prompt:z.string().min(1).max(200_000).optional()}).strict().default({}),
}).strict();
export type WebChatConfig = z.infer<typeof configSchema>;
export function normalizeWebChatConfig(value: unknown): WebChatConfig { return configSchema.parse(value ?? {}); }

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export function conversationIdentity(site: WebChatSite, raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.origin !== site.origin || url.username || url.password || url.port) return null;
    const pieces = url.pathname.split("/").filter(Boolean);
    if (pieces.length !== 2 || !site.conversationPaths.includes(pieces[0]!)) return null;
    const id = pieces[1]!;
    return idPattern.test(id) && !["new","temporary-chat"].includes(id.toLowerCase()) ? id : null;
  } catch { return null; }
}
export function safeConversationUrl(site: WebChatSite, raw: string, id: string): string {
  if (!idPattern.test(id) || conversationIdentity(site, raw) !== id) throw new Error(`${site.id} collect conversation identity mismatch`);
  const url = new URL(raw);
  if (url.search || url.hash || url.username || url.password) throw new Error("Conversation URL must be canonical and contain no query or fragment");
  return url.toString();
}
export type CollectSnapshot = {assistantCount:number; text:string; generating:boolean; loadError:boolean};
export function decideCollect(s:CollectSnapshot, stablePasses:number, settled:boolean): "pending"|"generating"|"unavailable"|"completed" {
  if (s.loadError) return "unavailable";
  if (s.generating) return "generating";
  return s.assistantCount > 0 && s.text.trim() && stablePasses >= 1 && settled ? "completed" : "pending";
}
const collectSchema = z.object({
  conversationId:z.string().regex(idPattern),
  conversationUrl:z.string().url(),
  timeoutMs:z.number().int().min(1000).max(90000).default(60000),
  settleMs:z.number().int().min(1000).max(30000).default(3000)
}).strict();
const pause = (page:Page, ms:number) => page.waitForTimeout(ms);
async function visible(page:Page, selector:string):Promise<boolean> {
  try { return await page.locator(selector).first().isVisible(); } catch { return false; }
}
async function inspect(site:WebChatSite, page:Page) {
  const url=page.url();
  if (!url.startsWith(site.origin+"/") && url!==site.origin) return {status:"unavailable",reason:"FOREIGN_ORIGIN",url,provider:site.id};
  if (await visible(page,site.login)) return {status:"unavailable",reason:"LOGIN_REQUIRED",url,provider:site.id};
  if (await visible(page,site.loadError)) return {status:"unavailable",reason:"TRANSIENT_LOAD_ERROR",retryable:true,url,provider:site.id};
  let shellText="";
  try { shellText=await page.locator("body").innerText({timeout:1000}); } catch {}
  if (/Cloudflare/i.test(shellText) && /security verification|安全驗證|verify you are human|checking your browser|安全服務/i.test(shellText))
    return {status:"unavailable",reason:"SITE_CHALLENGE",retryable:false,url,provider:site.id};
  if (await visible(page,site.editor)) return {status:"ready",url,provider:site.id};
  if (await visible(page,site.loading)) return {status:"pending",reason:"HYDRATING",url,provider:site.id};
  return {status:"unavailable",reason:"COMPOSER_NOT_FOUND",retryable:true,url,provider:site.id};
}
async function waitReady(site:WebChatSite,page:Page) {
  const deadline=Date.now()+12000;
  let result=await inspect(site,page);
  while(Date.now()<deadline && result.status!=="ready" &&
      !["LOGIN_REQUIRED","TRANSIENT_LOAD_ERROR","FOREIGN_ORIGIN","SITE_CHALLENGE"].includes(String(result.reason))) {
    await pause(page,250);
    result=await inspect(site,page);
  }
  return result;
}
async function ensureConnector(site:WebChatSite,page:Page,cfg:WebChatConfig) {
  if(cfg.connector.strategy==="preconnected") return "unverified_until_tool_result";
  const picker=page.locator(site.connectorPicker).first();
  if(!await visible(page,site.connectorPicker)) return null;
  await picker.click();
  const option=page.locator(site.connectorOption).filter({hasText:cfg.connector.name}).first();
  if(!await option.isVisible().catch(()=>false)) return null;
  await option.click();
  if(!await visible(page,site.connectorSelected)) return null;
  return "selected_in_ui";
}
async function trigger(site:WebChatSite,page:Page,cfg:WebChatConfig,args:Record<string,unknown>) {
  const prompt = typeof args.prompt==="string" ? args.prompt : cfg.trigger.prompt;
  if(!prompt?.trim() || prompt.length>200000) throw new Error(`${site.id} trigger requires a nonempty prompt`);
  try { await page.goto(site.newChatUrl,{waitUntil:"domcontentloaded",timeout:30000}); }
  catch { return {status:"unavailable",provider:site.id,reason:"NAVIGATION_FAILED",retryable:true}; }
  const preflight=await waitReady(site,page);
  if(preflight.status!=="ready") return preflight;
  let connectorVerification:string|null;
  try { connectorVerification=await ensureConnector(site,page,cfg); }
  catch { return {status:"unavailable",provider:site.id,reason:"CONNECTOR_UI_UNAVAILABLE",retryable:true}; }
  if(!connectorVerification) return {status:"unavailable",provider:site.id,reason:"CONNECTOR_NOT_SELECTED"};
  const composer=page.locator(site.editor).first();
  try { await composer.waitFor({state:"visible",timeout:15000}); await composer.fill(prompt); }
  catch { return {status:"unavailable",provider:site.id,reason:"COMPOSER_NOT_READY",retryable:true}; }
  const send=page.locator(site.send).first();
  try { await send.waitFor({state:"visible",timeout:10000}); }
  catch { return {status:"unavailable",provider:site.id,reason:"SEND_CONTROL_MISSING",retryable:true}; }
  // From this point a failed Playwright acknowledgement cannot prove whether submission happened.
  try { await send.click({timeout:10000}); }
  catch { return {status:"ambiguous",provider:site.id,reason:"SEND_OUTCOME_UNKNOWN",retryable:false,connectorVerification}; }
  const deadline=Date.now()+12000;
  do {
    const url=page.url(); const conversationId=conversationIdentity(site,url);
    if(conversationId) return {status:"triggered",provider:site.id,conversationId,conversationUrl:new URL(url).origin+new URL(url).pathname,url:new URL(url).origin+new URL(url).pathname,connectorVerification};
    await pause(page,250);
  } while(Date.now()<deadline);
  return {status:"ambiguous",provider:site.id,reason:"CONVERSATION_ID_NOT_CONFIRMED",retryable:false,connectorVerification};
}
async function collect(site:WebChatSite,page:Page,args:Record<string,unknown>) {
  const input=collectSchema.parse(args);
  const canonical=safeConversationUrl(site,input.conversationUrl,input.conversationId);
  try { await page.goto(canonical,{waitUntil:"domcontentloaded",timeout:30000}); }
  catch { return {status:"unavailable",provider:site.id,reason:"TRANSIENT_LOAD_ERROR",retryable:true,conversationId:input.conversationId,conversationUrl:canonical}; }
  const landing=await inspect(site,page);
  if(landing.status==="unavailable" && ["LOGIN_REQUIRED","SITE_CHALLENGE","TRANSIENT_LOAD_ERROR"].includes(String(landing.reason)))
    return {...landing,conversationId:input.conversationId,conversationUrl:canonical};
  if(conversationIdentity(site,page.url())!==input.conversationId)
    return {status:"unavailable",provider:site.id,reason:"CONVERSATION_ID_MISMATCH",retryable:false,conversationId:input.conversationId,conversationUrl:canonical};
  const deadline=Date.now()+input.timeoutMs;
  let last="",lastCount=0,stableSince:number|null=null,stablePasses=0,latestStatus:"pending"|"generating"|"unavailable"|"completed"="pending";
  do {
    if(await visible(page,site.login)) return {status:"unavailable",provider:site.id,reason:"LOGIN_REQUIRED",conversationId:input.conversationId,conversationUrl:canonical};
    const loadError=await visible(page,site.loadError);
    if(loadError) return {status:"unavailable",provider:site.id,reason:"TRANSIENT_LOAD_ERROR",retryable:true,conversationId:input.conversationId,conversationUrl:canonical};
    const messages=page.locator(site.assistant);
    const count=await messages.count().catch(()=>0);
    const text=count ? await messages.nth(count-1).innerText().catch(()=>"") : "";
    const generating=await visible(page,site.stop) || Boolean(site.working && await visible(page,site.working));
    const now=Date.now();
    const valid=count>0 && text.trim().length>0 && !generating;
    const unchanged:boolean=valid && count===lastCount && text.trim()===last && stableSince!==null;
    stablePasses=unchanged?stablePasses+1:0;
    stableSince=!valid?null:unchanged?stableSince:now;
    last=text.trim();lastCount=count;
    latestStatus=decideCollect({assistantCount:count,text, generating,loadError:false},stablePasses,stableSince!==null && now-stableSince>=input.settleMs);
    if(latestStatus==="completed") return {status:"completed",provider:site.id,conversationId:input.conversationId,conversationUrl:canonical,url:canonical,text:last};
    await pause(page,500);
  }while(Date.now()<deadline);
  return {status:latestStatus,provider:site.id,conversationId:input.conversationId,conversationUrl:canonical,url:canonical,partialText:last,retryable:true};
}
export function createWebChatAdapter(site:WebChatSite):HarnessAdapter {
  return {id:site.id,bootstrapUrl:site.bootstrapUrl,validateConfig:normalizeWebChatConfig,
    async execute(action,args,context) {
      const session=context.browser as BrowserSession|undefined;
      if(!session) throw new Error(`${site.id} adapter requires browser session`);
      const cfg=normalizeWebChatConfig((context.config as {adapterConfig?:unknown}|undefined)?.adapterConfig);
      if(action==="status" || action==="bootstrap_status") {
        if(!session.page.url().startsWith(site.origin)) {
          try { await session.page.goto(site.bootstrapUrl,{waitUntil:"domcontentloaded",timeout:30000}); }
          catch { return {status:"unavailable",provider:site.id,reason:"NAVIGATION_FAILED",retryable:true}; }
        }
        return {...await waitReady(site,session.page),connectorVerification:cfg.connector.strategy==="preconnected"?"unverified_until_tool_result":"requires_picker_during_trigger"};
      }
      if(action==="trigger") return trigger(site,session.page,cfg,args);
      if(action==="collect") return collect(site,session.page,args);
      throw new Error(`Unsupported ${site.id} action: ${action}`);
    }};
}
