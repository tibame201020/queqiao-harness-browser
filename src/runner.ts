import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeHarnessConfig } from "./core/config.js";
import { bootstrapClose, bootstrapOpen } from "./core/bootstrap.js";
import { openBrowserSession } from "./core/session.js";
import { defaultHarnessHome, listProfiles, loadConfig, profilePaths, saveConfig } from "./core/store.js";
import { nextSupervisorDecision } from "./core/supervisor.js";
import { executeRunLifecycle } from "./core/run-lifecycle.js";
import { AdapterRegistry } from "./adapters/registry.js";
import { genericAdapter } from "./adapters/generic.js";
import { chatgptAdapter } from "./adapters/chatgpt-adapter.js";

const registry = new AdapterRegistry([genericAdapter, chatgptAdapter]);
const home = process.env.QUEQIAO_HARNESS_HOME || defaultHarnessHome();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodePayload(): Record<string, any> { const raw = process.argv[3]; return raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : {}; }
function output(value: unknown) { process.stdout.write(JSON.stringify(value) + "\n"); }
async function readState(name: string): Promise<Record<string, any>> { try { return JSON.parse(await fsp.readFile(profilePaths(home, name).state, "utf8")); } catch { return {}; } }
async function writeState(name: string, updates: Record<string, unknown>) { const p = profilePaths(home, name); await fsp.mkdir(p.root, { recursive: true }); const state = { ...(await readState(name)), ...updates, updatedAt: new Date().toISOString() }; await fsp.writeFile(p.state, JSON.stringify(state, null, 2) + "\n", "utf8"); return state; }
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

async function runProfile(name: string, action?: string, args: Record<string, unknown> = {}, force = false) {
  const config = await loadConfig(home, name);
  const actualAction = action || config.defaultAction;
  const state = await readState(name);
  if (!force && actualAction === "trigger") {
    const decision = nextSupervisorDecision({ nowMs: Date.now(), lastTriggerAtMs: state.lastTriggerAtMs, leaseMs: config.runPolicy.leaseMinutes * 60000 });
    if (decision.kind === "busy") return { status: "busy", retryAfterMs: decision.retryAfterMs };
  }

  const result = await executeRunLifecycle({
    markRunning: () => writeState(name, { status: "RUNNING", action: actualAction, lastError: null }),
    open: () => openBrowserSession(config, home),
    execute: (session) => registry.execute(config.adapter, actualAction, args, { profileName: name, browser: session, config }),
    markSuccess: async (value) => {
      const updates: Record<string, unknown> = { status: "IDLE", lastAction: actualAction, lastResult: value, lastRunAt: Date.now() };
      if (actualAction === "trigger") updates.lastTriggerAtMs = Date.now();
      await writeState(name, updates);
    },
    markError: (error) => writeState(name, { status: "ERROR", lastError: error instanceof Error ? error.message : String(error) }),
    close: (session) => session.close(),
  });
  return { status: "ok", action: actualAction, result };
}


async function stopRequested(name: string): Promise<boolean> { return fs.existsSync(profilePaths(home, name).stopFlag); }
async function waitInterruptible(name: string, ms: number) { const end = Date.now() + ms; while (Date.now() < end) { if (await stopRequested(name)) return false; await sleep(Math.min(1000, end - Date.now())); } return true; }

async function supervisor(name: string): Promise<void> {
  const paths = profilePaths(home, name); const config = await loadConfig(home, name); if (config.schedule.type !== "interval") throw new Error("harness_start requires schedule.type=interval");
  await fsp.mkdir(paths.root, { recursive: true }); await fsp.rm(paths.stopFlag, { force: true });
  if (fs.existsSync(paths.supervisorPid)) { const old = Number((await fsp.readFile(paths.supervisorPid, "utf8")).trim()); if (old && pidAlive(old)) throw new Error(`Supervisor already running: ${old}`); }
  await fsp.writeFile(paths.supervisorPid, String(process.pid), "utf8"); await writeState(name, { supervisorPid: process.pid, supervisorStatus: "RUNNING" });
  try {
    if (!config.schedule.runOnStart && !(await waitInterruptible(name, config.schedule.intervalMinutes * 60000))) return;
    while (!(await stopRequested(name))) {
      let outcome: any; try { outcome = await runProfile(name); } catch (e) { outcome = { status: "failed", error: e instanceof Error ? e.message : String(e) }; }
      const delay = outcome.status === "busy" ? config.runPolicy.busyRetryMinutes : config.schedule.intervalMinutes; const nextRunAt = Date.now() + delay * 60000; await writeState(name, { supervisorStatus: "WAITING", nextRunAt, lastSupervisorOutcome: outcome });
      if (!(await waitInterruptible(name, delay * 60000))) break;
    }
  } finally { await writeState(name, { supervisorStatus: "STOPPED", supervisorPid: null, nextRunAt: null }); await fsp.rm(paths.supervisorPid, { force: true }); await fsp.rm(paths.stopFlag, { force: true }); }
}

async function main() {
  const command = process.argv[2] || ""; const payload = decodePayload();
  if (command === "init") { const config = normalizeHarnessConfig(payload.config); const adapterConfig = registry.validateConfig(config.adapter, config.adapterConfig); const normalized = { ...config, adapterConfig } as typeof config; await saveConfig(home, normalized); return output({ status: "ok", profile: normalized.name, config: normalized }); }
  if (command === "list") return output({ status: "ok", profiles: await listProfiles(home) });
  if (command === "status") return output({ status: "ok", profile: payload.name, state: await readState(payload.name), config: await loadConfig(home, payload.name) });
  if (command === "bootstrap") { const config = await loadConfig(home, payload.name); const url = config.browser.startUrl || registry.get(config.adapter).bootstrapUrl; const result = payload.operation === "close" ? { closed: await bootstrapClose(config) } : await bootstrapOpen(config, home, url); return output({ status: "ok", profile: payload.name, ...result }); }
  if (command === "run") return output(await runProfile(payload.name, payload.action, payload.args || {}, payload.force === true));
  if (command === "start") { const config = await loadConfig(home, payload.name); if (config.schedule.type !== "interval") throw new Error("harness_start requires interval schedule"); const paths = profilePaths(home, payload.name); if (fs.existsSync(paths.supervisorPid)) { const pid = Number((await fsp.readFile(paths.supervisorPid, "utf8")).trim()); if (pid && pidAlive(pid)) return output({ status: "already-running", pid }); } await fsp.rm(paths.stopFlag, { force: true }); const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervisor", Buffer.from(JSON.stringify({ name: payload.name })).toString("base64url")], { detached: true, stdio: "ignore" }); child.unref(); return output({ status: "started", pid: child.pid }); }
  if (command === "stop") { const paths = profilePaths(home, payload.name); await fsp.mkdir(paths.root, { recursive: true }); await fsp.writeFile(paths.stopFlag, "stop\n", "utf8"); let pid = 0; try { pid = Number((await fsp.readFile(paths.supervisorPid, "utf8")).trim()); } catch {} const end = Date.now() + 5000; while (pid && pidAlive(pid) && Date.now() < end) await sleep(200); return output({ status: "stopped", pid: pid || null }); }
  if (command === "supervisor") return supervisor(payload.name);
  throw new Error(`Unknown runner command: ${command}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
