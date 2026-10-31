import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeHarnessConfig } from "../dist/core/config.js";
import { profilePaths, saveConfig } from "../dist/core/store.js";

// CLI-level contract test: a missing synthetic CDP port must not be converted
// into a generic LOCAL_ACTION_FAILED or cause a new site SendAttempt.
const home = await fs.mkdtemp(path.join(os.tmpdir(), "queqiao-cdp-offline-fixture-"));
const name = "synthetic-attach-only-offline";
try {
  const cfg = normalizeHarnessConfig({
    name, adapter:"chatgpt",
    browser:{ connection:"cdp", cdpUrl:"http://127.0.0.1:18985" },
  });
  await saveConfig(home,cfg);
  for (const action of ["collect","trigger"]) {
    const encoded=Buffer.from(JSON.stringify({name,action,args:{}})).toString("base64url");
    const result=spawnSync(process.execPath,[fileURLToPath(new URL("../dist/runner.js",import.meta.url)),"run",encoded],{
      encoding:"utf8",env:{...process.env,QUEQIAO_HARNESS_HOME:home},timeout:20000,
    });
    assert.equal(result.status,0,`CLI ${action} failed: ${result.stderr?.slice(0,140)}`);
    const data=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(data.status,"unavailable");
    assert.equal(data.reason,"CDP_ENDPOINT_UNAVAILABLE");
    assert.deepEqual(data.recovery,{mode:"attach-only",attempted:false,outcome:"disabled"});
    assert.equal(data.action,action);
    assert.equal(data.endpointStatus,"absent");
    assert.doesNotMatch(JSON.stringify(data),/18985|ECONNREFUSED|LOCAL_ACTION_FAILED|chatgpt\.com/);
  }
  const dir = profilePaths(home,name).root;
  const entries=await fs.readdir(dir);
  assert.equal(entries.some(x=>x.includes("send-attempt")),false);
  const state=JSON.parse(await fs.readFile(profilePaths(home,name).state,"utf8"));
  assert.equal(state.lastError,"CDP_ENDPOINT_UNAVAILABLE");
  console.log("CDP_OFFLINE_COLLECT_AND_TRIGGER_STRUCTURED_NO_SEND_OK");
} finally {
  await fs.rm(home,{recursive:true,force:true});
}
