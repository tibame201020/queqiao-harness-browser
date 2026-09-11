import { z } from "zod";
import { normalizeHarnessConfig, type HarnessConfig } from "./config.js";

export type ScriptErrorCode = "SCRIPT_INVALID" | "SCRIPT_UNSUPPORTED" | "SCRIPT_AUTH_REQUIRED";
export type ScriptIssue = { path: string; reason: string };

export class ExecutionScriptError extends Error {
  constructor(public readonly code: ScriptErrorCode, public readonly issues: ScriptIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.reason}`).join("; ") || code);
    this.name = "ExecutionScriptError";
  }
}

const executionIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
const recordSchema = z.record(z.string(), z.unknown());
const baseScriptSchema = z.object({
  version: z.literal("1"),
  execution: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("once") }).strict(),
    z.object({ mode: z.literal("interval"), id: executionIdSchema.optional(), intervalMinutes: z.number().positive().max(10080), runOnStart: z.boolean().default(true) }).strict(),
  ]),
  authorization: z.object({ destructive: z.boolean().optional() }).strict().optional(),
  task: z.object({
    adapter: z.string().min(1).max(64),
    action: z.string().min(1).max(64),
    target: z.unknown().optional(),
    input: recordSchema.default({}),
    retention: z.object({ maxConversations: z.number().int().positive().max(1000) }).strict().optional(),
  }).strict(),
}).strict();

const projectSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z.object({ mode: z.literal("existing"), name: z.string().min(1).max(256), requiredSourceName: z.string().min(1).max(256).optional() }).strict(),
]);
const conversationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new") }).strict(),
  z.object({ mode: z.literal("reuse"), id: z.string().uuid() }).strict(),
]);
const chatTriggerTargetSchema = z.object({ project: projectSchema, conversation: conversationSchema }).strict();
const chatCleanupTargetSchema = z.object({ project: z.object({ mode: z.literal("existing"), name: z.string().min(1).max(256) }).strict() }).strict();
const genericOpenInputSchema = z.object({ url: z.string().url().refine((value) => /^https?:\/\//i.test(value), "must use http(s)"), waitForSelector: z.string().min(1).optional() }).strict();
const chatTriggerInputSchema = z.object({ prompt: z.string().min(1).max(200_000) }).strict();
const cleanupInputSchema = z.object({ apply: z.boolean().default(false) }).strict();
const emptyInputSchema = z.object({}).strict();

function zodIssues(error: z.ZodError, prefix = ""): ScriptIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, issue.path.join(".")].filter(Boolean).join("."), reason: issue.message }));
}
function parseOrInvalid<T>(schema: z.ZodType<T>, value: unknown, prefix: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ExecutionScriptError("SCRIPT_INVALID", zodIssues(result.error, prefix));
  return result.data;
}
function unsupported(path: string, reason: string): never {
  throw new ExecutionScriptError("SCRIPT_UNSUPPORTED", [{ path, reason }]);
}

export type CompiledExecutionScript = { executionId: string; mode: "once" | "interval"; action: string; args: Record<string, unknown>; config: HarnessConfig };

export function compileExecutionScript(input: unknown): CompiledExecutionScript {
  const parsed = baseScriptSchema.safeParse(input);
  if (!parsed.success) throw new ExecutionScriptError("SCRIPT_INVALID", zodIssues(parsed.error));
  const script = parsed.data;

  let executionId: string;
  if (script.execution.mode === "interval") {
    if (!script.execution.id) throw new ExecutionScriptError("SCRIPT_INVALID", [{ path: "execution.id", reason: "required for interval execution" }]);
    executionId = script.execution.id;
  } else executionId = `script-${script.task.adapter}-default`;

  const schedule = script.execution.mode === "interval"
    ? { type: "interval" as const, intervalMinutes: script.execution.intervalMinutes, runOnStart: script.execution.runOnStart }
    : { type: "manual" as const };

  if (script.task.adapter === "generic") {
    if (script.task.action !== "open") unsupported("task.action", `unsupported generic action: ${script.task.action}`);
    const data = parseOrInvalid(genericOpenInputSchema, script.task.input, "task.input");
    const adapterConfig: Record<string, unknown> = { url: data.url };
    if (data.waitForSelector) adapterConfig.waitForSelector = data.waitForSelector;
    const config = normalizeHarnessConfig({ name: executionId, adapter: "generic", defaultAction: "open", browser: { engine: "chromium", channel: "chrome", headless: true, startMinimized: true, connection: "managed" }, schedule, adapterConfig });
    return { executionId, mode: script.execution.mode, action: "open", args: {}, config };
  }

  if (script.task.adapter !== "chatgpt") unsupported("task.adapter", `unsupported adapter: ${script.task.adapter}`);
  const browser = { engine: "chromium" as const, channel: "chrome" as const, headless: false, startMinimized: true, connection: "managed" as const };

  if (script.task.action === "list_projects") {
    parseOrInvalid(emptyInputSchema, script.task.input, "task.input");
    const config = normalizeHarnessConfig({ name: executionId, adapter: "chatgpt", defaultAction: "list_projects", browser, schedule, adapterConfig: {} });
    return { executionId, mode: script.execution.mode, action: "list_projects", args: {}, config };
  }

  if (script.task.action === "trigger") {
    const target = parseOrInvalid(chatTriggerTargetSchema, script.task.target, "task.target");
    const data = parseOrInvalid(chatTriggerInputSchema, script.task.input, "task.input");
    if (script.task.retention && target.project.mode === "none") throw new ExecutionScriptError("SCRIPT_INVALID", [{ path: "task.retention", reason: "retention requires an existing ChatGPT project" }]);
    const project = target.project.mode === "existing"
      ? { enabled: true, name: target.project.name, ...(target.project.requiredSourceName ? { requiredSourceName: target.project.requiredSourceName } : {}) }
      : { enabled: false };
    const conversation = target.conversation.mode === "reuse" ? { newChatEachRun: false, conversationId: target.conversation.id } : { newChatEachRun: true };
    const cleanup = script.task.retention ? { enabled: true, maxConversations: script.task.retention.maxConversations } : { enabled: false };
    const adapterConfig = { project, conversation, cleanup, trigger: { prompt: data.prompt } };
    const config = normalizeHarnessConfig({ name: executionId, adapter: "chatgpt", defaultAction: "trigger", browser, schedule, adapterConfig });
    return { executionId, mode: script.execution.mode, action: "trigger", args: {}, config };
  }

  if (script.task.action === "cleanup") {
    if (script.execution.mode === "interval") unsupported("task.action", "chatgpt cleanup is one-shot only");
    const target = parseOrInvalid(chatCleanupTargetSchema, script.task.target, "task.target");
    const data = parseOrInvalid(cleanupInputSchema, script.task.input, "task.input");
    if (data.apply && script.authorization?.destructive !== true) throw new ExecutionScriptError("SCRIPT_AUTH_REQUIRED", [{ path: "authorization.destructive", reason: "required when cleanup apply=true" }]);
    const adapterConfig = { project: { enabled: true, name: target.project.name }, conversation: { newChatEachRun: true }, cleanup: { enabled: false }, trigger: {} };
    const config = normalizeHarnessConfig({ name: executionId, adapter: "chatgpt", defaultAction: "cleanup", browser, schedule, adapterConfig });
    return { executionId, mode: "once", action: "cleanup", args: { apply: data.apply, projectName: target.project.name }, config };
  }

  unsupported("task.action", `unsupported chatgpt action: ${script.task.action}`);
}
