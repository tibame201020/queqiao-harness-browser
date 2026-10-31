import { describe, expect, it, vi } from "vitest";
import { normalizeHarnessConfig } from "./config.js";
import { CdpEndpointUnavailableError, recoverOwnedCdp, readCdpEndpointStatus, toCdpUnavailableResult } from "./cdp-recovery.js";

function owned() {
  return normalizeHarnessConfig({
    name:"synthetic-owned",
    adapter:"chatgpt",
    browser:{connection:"cdp",cdpUrl:"http://127.0.0.1:18985",debugPort:18985,cdpRecovery:"harness-owned"},
  });
}

describe("Issue #75 opt-in CDP lifecycle recovery",()=>{
  it("rejects implicit ownership, mismatched port, non-loopback endpoint and a custom user profile",()=>{
    expect(normalizeHarnessConfig({name:"external",adapter:"chatgpt",browser:{connection:"cdp",cdpUrl:"http://127.0.0.1:18985"}}).browser.cdpRecovery).toBe("attach-only");
    for (const browser of [
      {connection:"cdp",cdpUrl:"http://127.0.0.1:18985",cdpRecovery:"harness-owned"},
      {connection:"cdp",cdpUrl:"http://127.0.0.1:18985",debugPort:18885,cdpRecovery:"harness-owned"},
      {connection:"cdp",cdpUrl:"http://example.com:18985",debugPort:18985,cdpRecovery:"harness-owned"},
      {connection:"cdp",cdpUrl:"chrome",debugPort:18985,cdpRecovery:"harness-owned"},
      {connection:"cdp",cdpUrl:"http://127.0.0.1:18985",debugPort:18985,userDataDir:"C:/Users/private/default",cdpRecovery:"harness-owned"},
      {connection:"managed",debugPort:18985,cdpRecovery:"harness-owned"},
    ]) expect(()=>normalizeHarnessConfig({name:"synthetic",adapter:"chatgpt",browser:browser as never})).toThrow();
  });

  it("recovers exactly once with private default profile after absent endpoint, then verifies /json/version",async()=>{
    const probe=vi.fn().mockResolvedValueOnce("absent").mockResolvedValueOnce("absent").mockResolvedValueOnce("ready");
    const launch=vi.fn().mockResolvedValue(undefined);
    const mkdir=vi.fn().mockResolvedValue(undefined);
    const sleep=vi.fn().mockResolvedValue(undefined);
    const result=await recoverOwnedCdp(owned(),"C:/isolated-harness-root",{
      probe,launch,mkdir,sleep,now:(()=>{let t=0;return()=>t+=250})(),
      executable:()=> "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    expect(result).toEqual({attempted:true,outcome:"recovered"});
    expect(launch).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("synthetic-owned"),expect.objectContaining({recursive:true}));
    expect(launch.mock.calls[0][1]).toContain("--remote-debugging-port=18985");
    expect(launch.mock.calls[0][1].some((x:string)=>x.startsWith("--user-data-dir=")&&x.includes("synthetic-owned"))).toBe(true);
    expect(sleep).toHaveBeenCalled();
  });
  it("already-running CDP is attached without launch or browser close",async()=>{
    const launch=vi.fn();
    const result=await recoverOwnedCdp(owned(),"unused",{probe:vi.fn().mockResolvedValue("ready"),launch});
    expect(result).toEqual({attempted:false,outcome:"already_running"});
    expect(launch).not.toHaveBeenCalled();
  });
  it("non-CDP service occupying the port blocks process launch",async()=>{
    const launch=vi.fn();
    await expect(recoverOwnedCdp(owned(),"unused",{probe:vi.fn().mockResolvedValue("occupied"),launch})).rejects.toMatchObject({
      code:"CDP_ENDPOINT_UNAVAILABLE",endpointStatus:"occupied",
      recovery:{mode:"harness-owned",attempted:false,outcome:"endpoint_in_use"},
    });
    expect(launch).not.toHaveBeenCalled();
  });
  it("launch errors do not retry or reveal private executable path",async()=>{
    const launch=vi.fn().mockRejectedValue(new Error("SYNTHETIC_PRIVATE_EXECUTABLE_PATH"));
    await expect(recoverOwnedCdp(owned(),"unused",{
      probe:vi.fn().mockResolvedValue("absent"),launch,
      mkdir:vi.fn().mockResolvedValue(undefined),executable:()=> "private-chrome.exe",
    })).rejects.toMatchObject({code:"CDP_ENDPOINT_UNAVAILABLE",endpointStatus:"absent",
      recovery:{mode:"harness-owned",attempted:true,outcome:"launch_failed"}});
    expect(launch).toHaveBeenCalledOnce();
  });
  it("failed bounded readiness returns sanitized structured status, never endpoint URL or a page Send",async()=>{
    const launch=vi.fn().mockResolvedValue(undefined);
    let t=0;
    await expect(recoverOwnedCdp(owned(),"unused",{
      probe:vi.fn().mockResolvedValue("absent"),launch,
      now:()=>{t+=3000;return t},sleep:vi.fn().mockResolvedValue(undefined),
      mkdir:vi.fn().mockResolvedValue(undefined),executable:()=> "chrome.exe",
    })).rejects.toMatchObject({code:"CDP_ENDPOINT_UNAVAILABLE",
      recovery:{mode:"harness-owned",attempted:true,outcome:"readiness_failed"}});
    expect(launch).toHaveBeenCalledOnce();
  });
  it("reports CDP endpoint observation separately from supervisor desired/observed status",async()=>{
    const probe=vi.fn().mockResolvedValue("absent");
    const result=await readCdpEndpointStatus(owned(),probe);
    expect(probe).toHaveBeenCalledWith(18985);
    expect(result).toEqual({status:"absent",recoveryMode:"harness-owned"});
    const external=normalizeHarnessConfig({name:"named",adapter:"chatgpt",browser:{connection:"cdp",cdpUrl:"chrome"}});
    expect(await readCdpEndpointStatus(external,probe)).toEqual({status:"not_checked",recoveryMode:"attach-only"});
    expect(probe).toHaveBeenCalledOnce();
  });
  it("maps only known typed endpoint errors to runner result, and never leaks endpoint address",()=>{
    const issue=new CdpEndpointUnavailableError("absent",{mode:"attach-only",attempted:false,outcome:"disabled"});
    expect(toCdpUnavailableResult(issue)).toEqual({
      status:"unavailable",reason:"CDP_ENDPOINT_UNAVAILABLE",
      endpointStatus:"absent",recovery:{mode:"attach-only",attempted:false,outcome:"disabled"},
    });
    expect(JSON.stringify(toCdpUnavailableResult(issue))).not.toMatch(/http|18985|password/i);
    expect(toCdpUnavailableResult(new Error("not CDP"))).toBeNull();
  });
});
