import { z } from "zod";
import type { BrowserSession } from "../core/session.js";
import { selectRetentionCandidates } from "../core/state.js";
import type { HarnessAdapter } from "./types.js";
import { deleteConversation, listProjectConversations, listProjects, openConversation, openProject } from "./chatgpt-projects.js";

const conversationIdSchema = z.string().uuid();

const chatGptConfigSchema = z.object({
  project: z.object({
    enabled: z.boolean().default(false),
    name: z.string().min(1).max(256).optional(),
    requiredSourceName: z.string().min(1).max(256).optional(),
  }).default({ enabled: false }),
  conversation: z.object({
    newChatEachRun: z.boolean().default(true),
    conversationId: conversationIdSchema.optional(),
  }).default({ newChatEachRun: true }),
  cleanup: z.object({
    enabled: z.boolean().default(false),
    maxConversations: z.number().int().positive().max(1000).optional(),
  }).default({ enabled: false }),
  trigger: z.object({
    prompt: z.string().min(1).max(200_000).optional(),
  }).default({}),
}).superRefine((cfg, ctx) => {
  if (cfg.project.enabled && !cfg.project.name) {
    ctx.addIssue({ code: "custom", path: ["project", "name"], message: "project.name is required when project.enabled=true" });
  }
  if (!cfg.project.enabled && cfg.project.requiredSourceName) {
    ctx.addIssue({ code: "custom", path: ["project", "requiredSourceName"], message: "project.requiredSourceName requires project.enabled=true" });
  }
  if (!cfg.conversation.newChatEachRun && !cfg.conversation.conversationId) {
    ctx.addIssue({ code: "custom", path: ["conversation", "conversationId"], message: "conversationId is required when conversation.newChatEachRun=false" });
  }
  if (cfg.cleanup.enabled && !cfg.project.enabled) {
    ctx.addIssue({ code: "custom", path: ["cleanup", "enabled"], message: "cleanup requires project.enabled=true" });
  }
  if (cfg.cleanup.enabled && !cfg.cleanup.maxConversations) {
    ctx.addIssue({ code: "custom", path: ["cleanup", "maxConversations"], message: "cleanup.maxConversations is required when cleanup.enabled=true" });
  }
});

export type ChatGptAdapterConfig = z.infer<typeof chatGptConfigSchema>;

export function normalizeChatGptAdapterConfig(value: unknown): ChatGptAdapterConfig {
  return chatGptConfigSchema.parse(value ?? {});
}

async function requireSource(session: BrowserSession, sourceName: string): Promise<void> {
  const page = session.page;
  const base = page.url().replace(/[?#].*$/, "");
  await page.goto(`${base}?tab=sources`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const deadline = Date.now() + 15_000;
  let found = false;
  while (Date.now() < deadline && !found) {
    found = (await page.locator("body").innerText()).includes(sourceName);
    if (!found) await page.waitForTimeout(250);
  }
  if (!found) throw new Error(`Required Project source missing: ${sourceName}`);
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function cleanupOne(session: BrowserSession, projectName: string, apply: boolean) {
  await openProject(session.page, projectName);
  const conversations = await listProjectConversations(session.page);
  const candidates = conversations.filter((x) => !x.pinned);
  const result = {
    project: projectName,
    found: conversations.length,
    pinned: conversations.length - candidates.length,
    candidates: candidates.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
    items: candidates.map((x) => ({ id: x.id, title: x.title })),
  };
  if (!apply) return result;
  for (const item of candidates) {
    try {
      const status = await deleteConversation(session.page, item);
      if (status === "deleted") result.deleted++;
      else result.skipped++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

async function cleanupForTrigger(session: BrowserSession, cfg: ChatGptAdapterConfig): Promise<void> {
  if (!cfg.cleanup.enabled || !cfg.project.enabled || !cfg.project.name || !cfg.cleanup.maxConversations) return;
  const conversations = await listProjectConversations(session.page);
  const reserveForNewChat = cfg.conversation.newChatEachRun ? 1 : 0;
  const targetBeforeTrigger = Math.max(0, cfg.cleanup.maxConversations - reserveForNewChat);
  const protectedIds = new Set<string>();
  if (!cfg.conversation.newChatEachRun && cfg.conversation.conversationId) protectedIds.add(cfg.conversation.conversationId);
  const ids = selectRetentionCandidates(conversations, { maxConversations: targetBeforeTrigger, protectedIds });
  for (const id of ids) {
    const item = conversations.find((x) => x.id === id);
    if (item) await deleteConversation(session.page, item);
  }
}

async function prepareTriggerTarget(session: BrowserSession, cfg: ChatGptAdapterConfig): Promise<void> {
  if (cfg.project.enabled) {
    await openProject(session.page, cfg.project.name!);
    if (cfg.project.requiredSourceName) await requireSource(session, cfg.project.requiredSourceName);
    await cleanupForTrigger(session, cfg);
    if (!cfg.conversation.newChatEachRun) {
      await openConversation(session.page, cfg.conversation.conversationId!, true);
    }
    return;
  }

  if (cfg.conversation.newChatEachRun) {
    await session.page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  } else {
    await openConversation(session.page, cfg.conversation.conversationId!, false);
  }
}

async function trigger(session: BrowserSession, cfg: ChatGptAdapterConfig, args: Record<string, unknown>) {
  const prompt = String(args.prompt || cfg.trigger.prompt || "");
  if (!prompt) throw new Error("chatgpt trigger requires trigger.prompt or args.prompt");

  await prepareTriggerTarget(session, cfg);
  const page = session.page;
  const composer = page.locator("#prompt-textarea");
  await composer.waitFor({ state: "visible", timeout: 15_000 });
  await composer.click();
  await page.keyboard.insertText(prompt);
  const send = page.locator('[data-testid="send-button"]');
  await send.waitFor({ state: "visible", timeout: 10_000 });
  await send.click();

  if (cfg.conversation.newChatEachRun) {
    await page.waitForURL(/\/c\/[0-9a-f-]{36}/i, { timeout: 20_000 });
  }
  return { status: "triggered", url: page.url() };
}

export const chatgptAdapter: HarnessAdapter = {
  id: "chatgpt",
  bootstrapUrl: "https://chatgpt.com/",
  validateConfig: normalizeChatGptAdapterConfig,
  async execute(action, args, context) {
    const session = context.browser as BrowserSession | undefined;
    if (!session) throw new Error("chatgpt adapter requires a browser session");
    const cfg = normalizeChatGptAdapterConfig((context.config as { adapterConfig?: unknown } | undefined)?.adapterConfig);

    if (action === "list_projects") return { projects: await listProjects(session.page) };
    if (action === "cleanup") {
      const projects = Array.isArray(args.projects)
        ? args.projects.map(String)
        : [String(args.projectName || cfg.project.name || "")].filter(Boolean);
      if (!projects.length) throw new Error("chatgpt cleanup requires projects/projectName");
      const apply = args.apply === true;
      const results = [];
      for (const project of projects) results.push(await cleanupOne(session, project, apply));
      return { apply, results };
    }
    if (action === "trigger") return trigger(session, cfg, args);
    throw new Error(`Unsupported chatgpt action: ${action}`);
  },
};
