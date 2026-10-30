import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { profilePaths } from "./store.js";

export type PendingReason = "NO_ASSISTANT_MESSAGE" | "EMPTY_ASSISTANT_TEXT" | "GENERATION_ACTIVE" | "UNSTABLE_MESSAGE_COUNT" | "UNSTABLE_TEXT" | "SETTLE_WINDOW_NOT_MET";
type Snapshot = { assistantCount:number; latestText:string; generating:boolean };
type State = { latestText:string; assistantCount:number; stablePasses:number; stableSinceMs:number|null; done:boolean };
export function collectPendingDiagnostic(snapshot:Snapshot, previous:State, elapsedMs:number, timeoutMs:number, settleMs:number, nowMs=Date.now()) {
 const pendingReason:PendingReason =
  snapshot.assistantCount===0 ? "NO_ASSISTANT_MESSAGE"
  : snapshot.latestText.trim().length===0 ? "EMPTY_ASSISTANT_TEXT"
  : snapshot.generating ? "GENERATION_ACTIVE"
  : snapshot.assistantCount!==previous.assistantCount ? "UNSTABLE_MESSAGE_COUNT"
  : snapshot.latestText.trim()!==previous.latestText ? "UNSTABLE_TEXT"
  : "SETTLE_WINDOW_NOT_MET";
 return {pendingReason,assistantCount:snapshot.assistantCount,hasText:!!snapshot.latestText.trim(),generating:snapshot.generating,
  elapsedMs:Math.max(0,elapsedMs),timeoutMs,settleMs,stablePasses:previous.stablePasses,
  stableDurationMs:previous.stableSinceMs===null?0:Math.max(0,nowMs-previous.stableSinceMs)};
}
type PendingResult={status?:string;diagnostic?:Record<string,unknown>};
export async function capturePendingCollectScreenshot<T extends PendingResult>(
 page:Pick<Page,"screenshot">,home:string,profile:string,value:T,enabled:boolean,
):Promise<T & {diagnostic?:Record<string,unknown> & {failureScreenshot?:{status:'saved'|'capture_failed';file?:string}}}>{
 if(!enabled||value.status!=="pending")return value;
 let failureScreenshot:{status:"saved"|"capture_failed";file?:string};
 try {
  const dir=path.join(profilePaths(home,profile).root,"private-diagnostics");
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const file="collect-pending-"+randomUUID()+".png";
  const bytes=await page.screenshot({type:"png",animations:"disabled",timeout:5000});
  await fs.writeFile(path.join(dir,file),bytes,{flag:"wx",mode:0o600});
  failureScreenshot={status:"saved",file};
 }catch{failureScreenshot={status:"capture_failed"}}
 return {...value,diagnostic:{...value.diagnostic,failureScreenshot}};
}
