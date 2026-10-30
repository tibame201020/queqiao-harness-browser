import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectPendingDiagnostic, capturePendingCollectScreenshot } from "./collect-diagnostics.js";
import { profilePaths } from "./store.js";

describe("Issue #72 collect pending diagnostics", () => {
  it.each([
    [{assistantCount:0,latestText:"",generating:false}, "NO_ASSISTANT_MESSAGE"],
    [{assistantCount:1,latestText:"",generating:false}, "EMPTY_ASSISTANT_TEXT"],
    [{assistantCount:1,latestText:"abc",generating:true}, "GENERATION_ACTIVE"],
    [{assistantCount:1,latestText:"abc",generating:false}, "SETTLE_WINDOW_NOT_MET"],
  ] as const)("classifies observed pending state", (snapshot, reason) => {
    const got=collectPendingDiagnostic(snapshot,{latestText:"abc",assistantCount:1,stablePasses:0,stableSinceMs:100,done:false},130,30000,1500);
    expect(got).toMatchObject({pendingReason:reason,assistantCount:snapshot.assistantCount,hasText:Boolean(snapshot.latestText),generating:snapshot.generating,timeoutMs:30000,settleMs:1500});
    expect(JSON.stringify(got)).not.toContain("abc");
  });
  it("distinguishes changing assistant count and changing text",()=>{
    const count=collectPendingDiagnostic({assistantCount:2,latestText:"abc",generating:false},{latestText:"abc",assistantCount:1,stablePasses:0,stableSinceMs:null,done:false},200,1000,1500);
    expect(count.pendingReason).toBe("UNSTABLE_MESSAGE_COUNT");
    const text=collectPendingDiagnostic({assistantCount:1,latestText:"new",generating:false},{latestText:"old",assistantCount:1,stablePasses:0,stableSinceMs:null,done:false},200,1000,1500);
    expect(text.pendingReason).toBe("UNSTABLE_TEXT");
  });
  it("saves opt-in screenshot in private profile, returns only opaque filename and doesn't override pending",async()=>{
    const home=await fs.mkdtemp(path.join(os.tmpdir(),"collect-diag-"));
    try {
      const page={screenshot:vi.fn(async()=>Buffer.from("synthetic only"))};
      const original={status:"pending",diagnostic:{pendingReason:"GENERATION_ACTIVE"}};
      expect(await capturePendingCollectScreenshot(page,home,"test-profile",original,false)).toEqual(original);
      expect(page.screenshot).not.toHaveBeenCalled();
      const r=await capturePendingCollectScreenshot(page,home,"test-profile",original,true);
      expect(r.status).toBe("pending");
      expect(r.diagnostic?.failureScreenshot?.status).toBe("saved");
      const filename=r.diagnostic?.failureScreenshot?.file;
      expect(filename).toMatch(/^collect-pending-[0-9a-f-]{36}\.png$/);
      expect(await fs.readFile(path.join(profilePaths(home,"test-profile").root,"private-diagnostics",filename!))).toEqual(Buffer.from("synthetic only"));
      page.screenshot.mockRejectedValueOnce(new Error("private error text"));
      const failed=await capturePendingCollectScreenshot(page,home,"test-profile",original,true);
      expect(failed.diagnostic?.failureScreenshot).toEqual({status:"capture_failed"});
      expect(JSON.stringify(failed)).not.toContain("private error text");
    } finally { await fs.rm(home,{recursive:true,force:true}); }
  });
});
