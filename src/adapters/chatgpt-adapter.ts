import { z } from "zod";
import type { BrowserSession } from "../core/session.js";
import { selectRetentionCandidates } from "../core/state.js";
import type { HarnessAdapter } from "./types.js";
import {
  advanceAssistantCollectScan,
  conversationIdFromHref,
  initialAssistantCollectState,
} from "./chatgpt.js";
import { deleteConversation, listProjectConversations, listProjects, openConversation, openProject, projectConversationUrl, startProjectNewConversation } from "./chatgpt-projects.js";

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
    pluginId: z.string().regex(/^plugin_asdk_app_[0-9a-f]{32}$/).optional(),
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
  if (cfg.trigger.pluginId && (cfg.project.enabled || !cfg.conversation.newChatEachRun)) {
    ctx.addIssue({ code: "custom", path: ["trigger", "pluginId"],
      message: "pluginId requires a new conversation without Project mode" });
  }  if (cfg.cleanup.enabled && !cfg.project.enabled) {
    ctx.addIssue({ code: "custom", path: ["cleanup", "enabled"], message: "cleanup requires project.enabled=true" });
  }
  if (cfg.cleanup.enabled && !cfg.cleanup.maxConversations) {
    ctx.addIssue({ code: "custom", path: ["cleanup", "maxConversations"], message: "cleanup.maxConversations is required when cleanup.enabled=true" });
  }
});

const collectArgsSchema = z.object({
  conversationId: conversationIdSchema,
  conversationUrl: z.string().url().optional(),
  projectName: z.string().min(1).max(256).optional(),
  timeoutMs: z.number().int().min(1000).max(90_000).default(60_000),
}).strict();

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

async function prepareTriggerTarget(session: BrowserSession, cfg: ChatGptAdapterConfig): Promise<{ projectId?: string }> {
  if (cfg.project.enabled) {
    if (cfg.conversation.newChatEachRun && !cfg.cleanup.enabled && !cfg.project.requiredSourceName) {
      return startProjectNewConversation(session.page, cfg.project.name!);
    }
    await openProject(session.page, cfg.project.name!);
    if (cfg.project.requiredSourceName) await requireSource(session, cfg.project.requiredSourceName);
    await cleanupForTrigger(session, cfg);
    if (!cfg.conversation.newChatEachRun) {
      await openConversation(session.page, cfg.conversation.conversationId!, true);
    }
    return {};
  }

  if (cfg.conversation.newChatEachRun) {
    if (cfg.trigger.pluginId) {
      // The installed plugin's "Try in chat" flow selects the app for this draft.
      // Only a validated plugin ID can influence navigation.
      await session.page.goto(`https://chatgpt.com/plugins/${cfg.trigger.pluginId}`, {
        waitUntil: "domcontentloaded", timeout: 30_000,
      });
      const tryButton = session.page.getByRole("button", {
        name: /Try in chat|\u5728\u5c0d\u8a71\u4e2d\u8a66\u7528/i,
      });
      await tryButton.waitFor({ state: "visible", timeout: 15_000 });
      await tryButton.click();
    } else {
      await session.page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
  } else {
    await openConversation(session.page, cfg.conversation.conversationId!, false);
  }
  return {};
}

async function trigger(session: BrowserSession, cfg: ChatGptAdapterConfig, args: Record<string, unknown>) {
  const prompt = String(args.prompt || cfg.trigger.prompt || "");
  if (!prompt) throw new Error("chatgpt trigger requires trigger.prompt or args.prompt");

  const target = await prepareTriggerTarget(session, cfg);
  const page = session.page;
  // Support both legacy and current ChatGPT editor layouts.
  const composer = page.locator('#prompt-textarea:visible, [role="textbox"][contenteditable="true"]:visible').first();
  await composer.waitFor({ state: "visible", timeout: 15_000 });
  await composer.click();
  await page.keyboard.insertText(prompt);
  const send = page.locator('[data-testid="send-button"]:visible, form:has([role="textbox"][contenteditable="true"]) button[type="submit"]:visible').first();
  await send.waitFor({ state: "visible", timeout: 10_000 });
  await send.click();


  if (cfg.conversation.newChatEachRun) {
    await page.waitForURL(/\/c\/[0-9a-f-]{36}/i, { timeout: 8_000 });
  }
  const transientUrl = page.url();
  const conversationId = conversationIdFromHref(transientUrl) ?? cfg.conversation.conversationId ?? null;
  if (!conversationId) throw new Error(`Unable to resolve ChatGPT conversation id after trigger: ${transientUrl}`);
  const url = target.projectId ? projectConversationUrl(target.projectId, conversationId) : transientUrl;
  return { status: "triggered", url, conversationId };
}

async function isGenerationActive(session: BrowserSession): Promise<boolean> {
  const page = session.page;
  const selectors = [
    '[data-testid="stop-button"]',
    'button[aria-label="Stop generating"]',
    'button[aria-label="停止產生"]',
    'button[aria-label="停止生成"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return true;
  }
  return false;
}

async function collect(session: BrowserSession, cfg: ChatGptAdapterConfig, args: Record<string, unknown>) {
  const input = collectArgsSchema.parse(args);
  const page = session.page;
  if (input.conversationUrl) {
    const parsed = new URL(input.conversationUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") {
      throw new Error("chatgpt collect conversationUrl must use https://chatgpt.com");
    }
    if (conversationIdFromHref(parsed.pathname) !== input.conversationId) {
      throw new Error("chatgpt collect conversationUrl does not match conversationId");
    }
    await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!page.url().includes(`/c/${input.conversationId}`)) {
      throw new Error(`Conversation not found: ${input.conversationId}`);
    }
  } else {
    const projectName = input.projectName ?? (cfg.project.enabled ? cfg.project.name : undefined);
    if (projectName) {
      await openProject(page, projectName);
      await openConversation(page, input.conversationId, true);
    } else {
      await openConversation(page, input.conversationId, false);
    }
  }

  const deadline = Date.now() + input.timeoutMs;
  let state = initialAssistantCollectState();

  while (true) {
    const assistantMessages = page.locator('[data-message-author-role="assistant"], [data-markdown-text-style="assistant-message"]');
    const assistantCount = await assistantMessages.count();
    const latestText = assistantCount > 0
      ? await assistantMessages.nth(assistantCount - 1).innerText().catch(() => "")
      : "";
    const generating = await isGenerationActive(session);

    state = advanceAssistantCollectScan(state, { assistantCount, latestText, generating });
    if (state.done) {
      return {
        status: "completed",
        conversationId: input.conversationId,
        text: state.latestText,
        url: page.url(),
      };
    }

    if (Date.now() >= deadline) {
      return {
        status: "pending",
        conversationId: input.conversationId,
        partialText: state.latestText,
        url: page.url(),
      };
    }
    await page.waitForTimeout(500);
  }
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
    if (action === "collect") return collect(session, cfg, args);
    throw new Error(`Unsupported chatgpt action: ${action}`);
  },
};
