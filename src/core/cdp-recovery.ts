import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createConnection } from "node:net";
import type { HarnessConfig } from "./config.js";
import { resolveBrowserExecutable } from "./browser.js";
import { profilePaths } from "./store.js";

export type CdpEndpointStatus = "absent" | "occupied" | "unknown";
export type CdpRecovery = {
  mode: "attach-only" | "harness-owned";
  attempted: boolean;
  outcome: "disabled" | "already_running" | "recovered" | "endpoint_in_use" | "probe_failed" | "launch_failed" | "readiness_failed" | "reconnect_failed";
};

export class CdpEndpointUnavailableError extends Error {
  readonly code = "CDP_ENDPOINT_UNAVAILABLE";
  constructor(readonly endpointStatus: CdpEndpointStatus, readonly recovery: CdpRecovery) {
    // The exception and Runner stdout never contain CDP URL, executable/profile path, or account data.
    super("CDP_ENDPOINT_UNAVAILABLE");
    this.name = "CdpEndpointUnavailableError";
  }
}

export function toCdpUnavailableResult(error: unknown) {
  if (!(error instanceof CdpEndpointUnavailableError)) return null;
  return {
    status: "unavailable" as const,
    reason: error.code,
    endpointStatus: error.endpointStatus,
    recovery: error.recovery,
  };
}

export function isCdpConnectionRefused(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ERR_CONNECTION_REFUSED|connect ETIMEDOUT|ECONNRESET|ERR_CONNECTION_RESET/i.test(msg);
}

type ProbeStatus = "ready" | CdpEndpointStatus;
type OwnedCdpDependencies = {
  probe?: (port: number) => Promise<ProbeStatus>;
  launch?: (executable: string, args: string[]) => Promise<void>;
  mkdir?: (directory: string, options: { recursive: true; mode: number }) => Promise<unknown>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  executable?: (config: HarnessConfig) => string;
};

// Never probe or relaunch a configured remote host; owned-mode configuration is
// independently validated as 127.0.0.1 and a dedicated, explicit debugPort.
async function tcpStatus(port: number): Promise<CdpEndpointStatus> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let done = false;
    const settle = (result: CdpEndpointStatus) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(800, () => settle("unknown"));
    socket.once("connect", () => settle("occupied"));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      settle(error.code === "ECONNREFUSED" ? "absent" : "unknown"));
  });
}

export async function probeCdpEndpoint(port: number): Promise<ProbeStatus> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
    if (!r.ok) return "occupied";
    const json = await r.json() as Record<string, unknown>;
    return typeof json.webSocketDebuggerUrl === "string" && json.webSocketDebuggerUrl.startsWith("ws")
      ? "ready" : "occupied";
  } catch {
    // An occupied non-HTTP port must never cause us to spawn a competing Chrome.
    return tcpStatus(port);
  }
}

/** Read-only endpoint status is separate from supervisor desired/observedStatus. */
export async function readCdpEndpointStatus(
  config: HarnessConfig, probe: (port: number) => Promise<ProbeStatus> = probeCdpEndpoint,
): Promise<{ status: ProbeStatus | "not_checked"; recoveryMode: "attach-only" | "harness-owned" } | null> {
  if (config.browser.connection !== "cdp") return null;
  let port: number | null = null;
  try {
    const url = new URL(config.browser.cdpUrl!);
    if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port)
      port = Number(url.port);
  } catch { /* Chrome named debugging channels and external URLs are never locally probed. */ }
  if (port === null) return { status: "not_checked", recoveryMode: config.browser.cdpRecovery };
  return { status: await probe(port), recoveryMode: config.browser.cdpRecovery };
}

async function launchOwnedBrowser(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("spawn", () => { child.unref(); resolve(); });
    child.once("error", reject);
  });
}

export async function recoverOwnedCdp(
  config: HarnessConfig,
  home: string,
  deps: OwnedCdpDependencies = {},
): Promise<{ attempted: boolean; outcome: "recovered" | "already_running" }> {
  if (config.browser.connection !== "cdp" || config.browser.cdpRecovery !== "harness-owned"
      || config.browser.debugPort === undefined) throw new Error("CDP_OWNERSHIP_NOT_CONFIGURED");
  const port = config.browser.debugPort;
  const probe = deps.probe ?? probeCdpEndpoint;
  const launch = deps.launch ?? launchOwnedBrowser;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const sleep = deps.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const status = await probe(port);
  if (status === "ready") return { attempted: false, outcome: "already_running" };
  if (status !== "absent") {
    throw new CdpEndpointUnavailableError(status, {
      mode: "harness-owned", attempted: false,
      outcome: status === "occupied" ? "endpoint_in_use" : "probe_failed",
    });
  }

  // Never inherit a caller's daily-driver userDataDir.
  const browserProfile = profilePaths(home, config.name).browserProfile;
  try {
    await mkdir(browserProfile, { recursive: true, mode: 0o700 });
    const executable = (deps.executable ?? (cfg => resolveBrowserExecutable({
      channel: cfg.browser.channel, executablePath: cfg.browser.executablePath,
    })))(config);
    await launch(executable, [
      `--user-data-dir=${browserProfile}`,
      "--profile-directory=Default",
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run", "--no-default-browser-check",
      ...(config.browser.headless ? ["--headless=new"] : config.browser.startMinimized ? ["--start-minimized"] : []),
      "about:blank",
    ]);
  } catch {
    throw new CdpEndpointUnavailableError("absent", {
      mode: "harness-owned", attempted: true, outcome: "launch_failed",
    });
  }

  const deadline = now() + 15_000;
  while (now() < deadline) {
    const next = await probe(port);
    if (next === "ready") return { attempted: true, outcome: "recovered" };
    if (next === "occupied") {
      throw new CdpEndpointUnavailableError("occupied", {
        mode: "harness-owned", attempted: true, outcome: "readiness_failed",
      });
    }
    await sleep(250);
  }
  throw new CdpEndpointUnavailableError("absent", {
    mode: "harness-owned", attempted: true, outcome: "readiness_failed",
  });
}
