import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeHarnessConfig } from "./core/config.js";
import { bootstrapClose, bootstrapOpen } from "./core/bootstrap.js";
import { openBrowserSession } from "./core/session.js";
import { readCdpEndpointStatus, toCdpUnavailableResult } from "./core/cdp-recovery.js";
import { captureComposerAbsentFailure } from "./core/failure-screenshot.js";
import { capturePendingCollectScreenshot } from "./core/collect-diagnostics.js";
import { defaultHarnessHome, listProfiles, loadConfig, profilePaths, saveConfig } from "./core/store.js";
import { nextSupervisorDecision } from "./core/supervisor.js";
import { ambiguousTriggerBlocked, nextAmbiguousTrigger, triggerMayHaveDispatched } from "./core/trigger-guard.js";
import { executeRunLifecycle } from "./core/run-lifecycle.js";
import { activeSendAttemptId, beginSendAttempt, finishSendAttempt, loadSendAttempt, observeSavedSendAttempt, sendAttemptMatchesProfile } from "./core/send-attempt.js";
import { executeExecutionScript } from "./core/execution-script-runtime.js";
import { reconcileRuntimeState } from "./core/runtime-status.js";
import { buildHarnessOverviewEntry } from "./core/overview.js";
import { createBuiltInRegistry } from "./adapters/builtins.js";

const registry = createBuiltInRegistry();
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
  // Pure URL resolution is independent of the browser and must not mutate profile state.
  if (actualAction === "resolve_targets") {
    if (config.adapter !== "chatgpt") throw new Error("RESOLVE_TARGETS_ADAPTER_UNSUPPORTED");
    const result = await registry.execute("chatgpt", actualAction, args, {profileName:name,config});
    return { status:"ok", action:actualAction, result };
  }
  const state = await readState(name);
  const browserBinding = createHash("sha256").update(JSON.stringify(config.browser)).digest("hex");
  const acknowledged = args.acknowledgeAmbiguous === true;
  // An original possible Send remains locked even after a runner crash, before
  // the normal adapter result can set its in-memory ambiguity guard.
  if (actualAction === "trigger" && config.adapter === "chatgpt") {
    const unresolvedId = state.pendingAttemptId ?? await activeSendAttemptId(home, name);
    if (unresolvedId) {
    const previous = await loadSendAttempt(home, name, unresolvedId);
    if (previous.status === "unknown") return {
      status: "blocked", reason: "UNRECONCILED_AMBIGUOUS_TRIGGER", provider: config.adapter,
      attemptId: previous.id,
    };
    }
  }
  if (ambiguousTriggerBlocked(state, config.adapter, actualAction, acknowledged)) return {status:"blocked",reason:"UNRECONCILED_AMBIGUOUS_TRIGGER",provider:config.adapter};
  if (!force && actualAction === "trigger") {
    const decision = nextSupervisorDecision({ nowMs: Date.now(), lastTriggerAtMs: state.lastTriggerAtMs, leaseMs: config.runPolicy.leaseMinutes * 60000 });
    if (decision.kind === "busy") return { status: "busy", retryAfterMs: decision.retryAfterMs };
  }

  let attemptId: string | null = null;
  let result;
  try { result = await executeRunLifecycle({
    markRunning: () => writeState(name, { status: "RUNNING", action: actualAction, lastError: null }),
    open: () => openBrowserSession(config, home),
    execute: async (session) => {
      if (actualAction === "resume") {
        if (config.adapter !== "chatgpt") throw new Error("Send Resume is supported only for ChatGPT existing conversations");
        const id = args.attemptId ?? (await readState(name)).pendingAttemptId ?? await activeSendAttemptId(home, name);
        if (typeof id !== "string") throw new Error("No original Send attempt ID to Resume");
        const original = await loadSendAttempt(home, name, id);
        const cfg = config.adapterConfig as { conversation?: { newChatEachRun?: boolean; conversationId?: string } };
        const existingResume = cfg.conversation?.newChatEachRun === false
          && sendAttemptMatchesProfile(original, browserBinding, cfg.conversation.conversationId ?? null);
        const projectFirstResume = cfg.conversation?.newChatEachRun === true
          && original.conversationId === null && typeof original.projectId === "string"
          && original.browserBinding === browserBinding;
        if (!existingResume && !projectFirstResume)
          throw new Error("Original Send attempt does not match this Browser Profile or Conversation");
        if (original.status === "submitted") {
          await finishSendAttempt(home, name, id, "submitted");
          return {
          status: "submitted", submissionState: "submitted", attemptId: id,
          conversationId: original.conversationId ?? new URL(original.observedUrl!).pathname.split("/").at(-1),
          url: original.observedUrl ?? `https://chatgpt.com/c/${original.conversationId}`,
        };
        }
        const resumeArgs = projectFirstResume
          ? { prompt: original.prompt, projectId: original.projectId, conversationUrl: original.observedUrl,
              baseline: original.baseline }
          : { prompt: original.prompt, conversationId: original.conversationId,
              observedUrl: original.observedUrl, baseline: original.baseline };
        if (projectFirstResume && !original.observedUrl) return {
          status: "pending", submissionState: "unknown", retryable: false, canResume: true, attemptId: id,
        };
        const value = await registry.execute("chatgpt", "resume", resumeArgs,
          { profileName: name, browser: session, config }) as { status: string };
        if (value.status === "submitted") await finishSendAttempt(home, name, id, "submitted");
        return { ...value, attemptId: id };
      }
      const siteValue = await registry.execute(config.adapter, actualAction, args, {
        profileName: name, browser: session, config,
        beforeSend: actualAction === "trigger" && config.adapter === "chatgpt"
          ? async (prompt, input) => {
            // Persist the original first-Project attempt before the only Send click.
            // A saved canonical URL is learned only from subsequent site observation.
            if (!input.conversationId && !input.projectId) return;
            const original = await beginSendAttempt(home, name, {
              prompt, conversationId: input.conversationId, projectId: input.projectId,
              observedUrl: input.observedUrl, baseline: input.baseline, browserBinding,
            });
            attemptId = original.id;
            await writeState(name, { pendingAttemptId: attemptId });
          } : undefined,
      }) as { status?: string; submissionState?: string; diagnostic?: { precomposeReason?: string | null; [key: string]: unknown } };
      // Read this Run-owned page once before lifecycle closes it.
      const value = actualAction === "trigger" && config.adapter === "chatgpt"
        ? await captureComposerAbsentFailure(session.page, home, name, siteValue)
        : actualAction === "collect" && config.adapter === "chatgpt"
          ? await capturePendingCollectScreenshot(session.page, home, name, siteValue,
            (args.diagnostics as {captureOnPending?:boolean}|undefined)?.captureOnPending===true)
          : siteValue;
      if (attemptId && value.status === "ambiguous") {
        const candidate = (value as { diagnostic?: { url?: string } }).diagnostic?.url;
        if (typeof candidate === "string") {
          // Only the observed canonical first-party route can be recovered later.
          await observeSavedSendAttempt(home, name, attemptId, candidate).catch(() => {});
        }
      }
      if (attemptId && value.status === "triggered") {
        const original = await loadSendAttempt(home, name, attemptId);
        const observed = (value as {url?:string}).url;
        if (original.conversationId === null && typeof observed === "string")
          await observeSavedSendAttempt(home, name, attemptId, observed);
        await finishSendAttempt(home, name, attemptId, "submitted");
      }
      return attemptId ? { ...value, attemptId } : value;
    },
    markSuccess: async (value) => {
      const updates: Record<string, unknown> = { status: "IDLE", lastAction: actualAction, lastResult: value, lastRunAt: Date.now() };
      if (triggerMayHaveDispatched(actualAction, value)) updates.lastTriggerAtMs = Date.now();
      if (actualAction === "resume" && value && typeof value === "object"
        && (value as { status?: string }).status === "submitted") {
        updates.pendingAttemptId = null;
        updates.ambiguousTrigger = false;
      }
      if (actualAction === "trigger" && value && typeof value === "object"
        && (value as { status?: string }).status === "triggered" && attemptId) updates.pendingAttemptId = null;
      // Receipt semantics are independent of the concrete HarnessAdapter id.
      // Preserve the legacy ChatGPT state shape unless an ambiguity flag was observed.
      if (actualAction !== "resume" && (state.ambiguousTrigger !== undefined || (value && typeof value === "object" && (value as { status?: string }).status === "ambiguous"))) {
        updates.ambiguousTrigger = nextAmbiguousTrigger(state.ambiguousTrigger === true, actualAction, value, acknowledged);
      }
      await writeState(name, updates);
    },
    markError: (error) => writeState(name, { status: "ERROR", lastError: error instanceof Error ? error.message : String(error) }),
    close: (session) => session.close(),
  });
  } catch (error) {
    const unavailable = toCdpUnavailableResult(error);
    if (unavailable) return { ...unavailable, action: actualAction };
    throw error;
  }
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

async function startSupervisor(name: string) {
  const config = await loadConfig(home, name);
  if (config.schedule.type !== "interval") throw new Error("harness_start requires interval schedule");
  await writeState(name, { desiredSupervisorStatus: "RUNNING" });
  const paths = profilePaths(home, name);
  if (fs.existsSync(paths.supervisorPid)) {
    const pid = Number((await fsp.readFile(paths.supervisorPid, "utf8")).trim());
    if (pid && pidAlive(pid)) return { status: "already-running", pid };
  }
  await fsp.rm(paths.stopFlag, { force: true });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervisor", Buffer.from(JSON.stringify({ name })).toString("base64url")], { detached: true, stdio: "ignore" });
  child.unref();
  return { status: "started", pid: child.pid };
}

async function stopSupervisor(name: string) {
  const paths = profilePaths(home, name);
  await writeState(name, { desiredSupervisorStatus: "STOPPED" });
  await fsp.mkdir(paths.root, { recursive: true });
  let pid = 0;
  try { pid = Number((await fsp.readFile(paths.supervisorPid, "utf8")).trim()); } catch {}
  if (!pid || !pidAlive(pid)) {
    await fsp.rm(paths.stopFlag, { force: true });
    await fsp.rm(paths.supervisorPid, { force: true });
    return { status: "stopped", pid: null };
  }
  await fsp.writeFile(paths.stopFlag, "stop\n", "utf8");
  const end = Date.now() + 5000;
  while (pidAlive(pid) && Date.now() < end) await sleep(200);
  if (pidAlive(pid)) throw new Error(`Supervisor did not stop within timeout: ${pid}`);
  return { status: "stopped", pid };
}

async function main() {
  const command = process.argv[2] || ""; const payload = decodePayload();
  if (command === "init") { const config = normalizeHarnessConfig(payload.config); const adapterConfig = registry.validateConfig(config.adapter, config.adapterConfig); const normalized = { ...config, adapterConfig } as typeof config; await saveConfig(home, normalized); return output({ status: "ok", profile: normalized.name, config: normalized }); }
  if (command === "list") return output({ status: "ok", profiles: await listProfiles(home) });
  if (command === "status") { const config = await loadConfig(home, payload.name); const state = await readState(payload.name); const browserEndpoint = await readCdpEndpointStatus(config); return output({ status: "ok", profile: payload.name, state: reconcileRuntimeState(config, state, pidAlive), browserEndpoint, config }); }
  if (command === "overview") { const profiles = await listProfiles(home); const entries = []; for (const profile of profiles) { const config = await loadConfig(home, profile); const state = await readState(profile); entries.push(buildHarnessOverviewEntry(config, state, pidAlive)); } return output({ status: "ok", profiles: entries }); }
  if (command === "bootstrap") { const config = await loadConfig(home, payload.name); const url = config.browser.startUrl || registry.get(config.adapter).bootstrapUrl; const result = payload.operation === "close" ? { closed: await bootstrapClose(config) } : await bootstrapOpen(config, home, url); return output({ status: "ok", profile: payload.name, ...result }); }
  if (command === "run") return output(await runProfile(payload.name, payload.action, payload.args || {}, payload.force === true));
  if (command === "execute-script") {
    const result = await executeExecutionScript(payload.script, {
      save: async (config) => {
        const adapterConfig = registry.validateConfig(config.adapter, config.adapterConfig);
        await saveConfig(home, { ...config, adapterConfig } as typeof config);
      },
      run: (name, action, args) => runProfile(name, action, args, true),
      start: (name) => startSupervisor(name),
      stop: (name) => stopSupervisor(name),
    });
    return output(result);
  }
  if (command === "start") return output(await startSupervisor(payload.name));
  if (command === "stop") return output(await stopSupervisor(payload.name));
  if (command === "supervisor") return supervisor(payload.name);
  throw new Error(`Unknown runner command: ${command}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
