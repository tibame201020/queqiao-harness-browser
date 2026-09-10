import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { QueqiaoExtension, ToolDefinition, WorkerExtensionContext } from "@tibame201020/queqiao/extension";

const EXTENSION_ID = "dev.queqiao.harness-browser";
const EXTENSION_VERSION = "0.2.0";
const workspaceId = z.string().min(1).max(64);
const name = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
const INIT_SCHEMA = z.object({ workspaceId, config: z.unknown() });
const LIST_SCHEMA = z.object({ workspaceId });
const BOOTSTRAP_SCHEMA = z.object({ workspaceId, name, operation: z.enum(["open", "close"]).default("open") });
const RUN_SCHEMA = z.object({ workspaceId, name, action: z.string().min(1).max(64).optional(), args: z.unknown().optional(), force: z.boolean().default(false) });
const NAME_SCHEMA = z.object({ workspaceId, name });

async function invokeRunner(context: WorkerExtensionContext, command: string, payload: unknown, timeoutMs = 120_000): Promise<unknown> {
  const runner = fileURLToPath(new URL("./runner.js", import.meta.url));
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const session = await context.runtime.stdio.open({ executable: "node", args: [runner, command, encoded], cwd: ".", timeoutMs, ...(context.signal ? { signal: context.signal } : {}) });
  let stdout = ""; let stderr = "";
  while (true) {
    try { const event = await session.next(); if (event.type === "stdout") stdout += event.data; else stderr += event.data; } catch { break; }
  }
  await session.closed;
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error(stderr.trim() || `Harness runner failed: ${command}`);
  try { return JSON.parse(line); } catch { throw new Error(`Invalid harness runner output: ${line} ${stderr}`); }
}

function tool<T>(definition: ToolDefinition<WorkerExtensionContext>): ToolDefinition<WorkerExtensionContext> { return definition; }

export const HARNESS_INIT = tool({ name: "harness_init", title: "Initialize browser harness", description: "Create or update a local browser harness profile. Site-specific behavior is selected by the profile adapter.", inputSchema: INIT_SCHEMA, requiredCapabilities: [], risk: "execute", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }, async execute(input, context) { const p = INIT_SCHEMA.parse(input); return invokeRunner(context, "init", { config: p.config }); } });
export const HARNESS_LIST = tool({ name: "harness_list", title: "List browser harness profiles", description: "List locally configured browser harness profiles.", inputSchema: LIST_SCHEMA, requiredCapabilities: [], risk: "read", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }, async execute(input, context) { LIST_SCHEMA.parse(input); return invokeRunner(context, "list", {}, 30_000); } });
export const HARNESS_BOOTSTRAP = tool({ name: "harness_bootstrap", title: "Bootstrap browser harness login", description: "Open or close a headed managed browser profile for one-time login/bootstrap.", inputSchema: BOOTSTRAP_SCHEMA, requiredCapabilities: [], risk: "execute", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false }, async execute(input, context) { const p = BOOTSTRAP_SCHEMA.parse(input); return invokeRunner(context, "bootstrap", { name: p.name, operation: p.operation }, 60_000); } });
export const HARNESS_RUN = tool({ name: "harness_run", title: "Run browser harness action", description: "Run one adapter action using the configured browser harness profile. Adapter arguments are passed through the args object.", inputSchema: RUN_SCHEMA, requiredCapabilities: [], risk: "execute", annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false }, async execute(input, context) { const p = RUN_SCHEMA.parse(input); return invokeRunner(context, "run", { name: p.name, action: p.action, args: p.args && typeof p.args === "object" ? p.args : {}, force: p.force }); } });
export const HARNESS_START = tool({ name: "harness_start", title: "Start browser harness supervisor", description: "Start the configured interval supervisor as a local background process.", inputSchema: NAME_SCHEMA, requiredCapabilities: [], risk: "execute", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true }, async execute(input, context) { const p = NAME_SCHEMA.parse(input); return invokeRunner(context, "start", { name: p.name }, 30_000); } });
export const HARNESS_STOP = tool({ name: "harness_stop", title: "Stop browser harness supervisor", description: "Stop a local browser harness interval supervisor without deleting its profile.", inputSchema: NAME_SCHEMA, requiredCapabilities: [], risk: "execute", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }, async execute(input, context) { const p = NAME_SCHEMA.parse(input); return invokeRunner(context, "stop", { name: p.name }, 30_000); } });
export const HARNESS_STATUS = tool({ name: "harness_status", title: "Read browser harness status", description: "Read configuration and runtime state for one browser harness profile.", inputSchema: NAME_SCHEMA, requiredCapabilities: [], risk: "read", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }, async execute(input, context) { const p = NAME_SCHEMA.parse(input); return invokeRunner(context, "status", { name: p.name }, 30_000); } });

const extension = { manifest: { id: EXTENSION_ID, version: EXTENSION_VERSION, displayName: "Queqiao Harness Browser", supportedEnvironments: ["windows", "linux", "darwin"] }, activate(api) { for (const def of [HARNESS_INIT,HARNESS_LIST,HARNESS_BOOTSTRAP,HARNESS_RUN,HARNESS_START,HARNESS_STOP,HARNESS_STATUS]) api.registerTool(def); } } satisfies QueqiaoExtension<WorkerExtensionContext>;
export default extension;
