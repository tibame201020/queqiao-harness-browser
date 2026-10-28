import { z } from "zod";
import type { BrowserSession } from "../core/session.js";
import { selectRetentionCandidates } from "../core/state.js";
import type { HarnessAdapter } from "./types.js";
import {
  advanceAssistantCollectScan,
  conversationIdFromHref,
  initialAssistantCollectState,
} from "./chatgpt.js";
import { ChatGptSendError, isChatGptGenerationActive, postClickAmbiguity, reconcileChatGptSend, sendChatGptPrompt } from "./chatgpt-send.js";
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
    // Explicit opt-in; old profiles remain new-chat by default.
    allowRuntimeTarget: z.boolean().default(false),
  }).default({ newChatEachRun: true, allowRuntimeTarget: false }),
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
  settleMs: z.number().int().min(1000).max(30_000).default(3000),
}).strict();

export type ChatGptAdapterConfig = z.infer<typeof chatGptConfigSchema>;

export function normalizeChatGptAdapterConfig(value: unknown): ChatGptAdapterConfig {
  return chatGptConfigSchema.parse(value ?? {});
}

// Resolve an optional per-run target before any browser operation. The destination
// must be a trusted n8n/Runner binding, not extracted from a model-generated reply.
export function selectChatGptTriggerConfig(cfg: ChatGptAdapterConfig, args: Record<string, unknown>): ChatGptAdapterConfig {
  const hasId=Object.prototype.hasOwnProperty.call(args,"conversationId");
  const hasUrl=Object.prototype.hasOwnProperty.call(args,"conversationUrl");
  if (!hasId && !hasUrl) return cfg;
  if (!cfg.conversation.allowRuntimeTarget) throw new Error("RUNTIME_TARGET_DISABLED");
  if (cfg.project.enabled || cfg.cleanup.enabled || cfg.trigger.pluginId ||
      !cfg.conversation.newChatEachRun || cfg.conversation.conversationId) {
    throw new Error("RUNTIME_TARGET_UNSUPPORTED");
  }
  const input=z.object({
    conversationId: conversationIdSchema,
    conversationUrl: z.string().url(),
  }).parse(args);
  if (input.conversationUrl !== `https://chatgpt.com/c/${input.conversationId}`) {
    throw new Error("RUNTIME_TARGET_IDENTITY_MISMATCH");
  }
  return { ...cfg, conversation: {
    ...cfg.conversation, newChatEachRun: false, conversationId: input.conversationId,
  }};
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

async function trigger(session: BrowserSession, cfg: ChatGptAdapterConfig, args: Record<string, unknown>,
  beforeSend?: (prompt: string, input: { conversationId: string | null; baseline: { bubbles: number; legacy: number } }) => Promise<void>) {
  cfg = selectChatGptTriggerConfig(cfg, args);
  const prompt = String(args.prompt || cfg.trigger.prompt || "");
  if (!prompt) throw new Error("chatgpt trigger requires trigger.prompt or args.prompt");

  const target = await prepareTriggerTarget(session, cfg);
  const page = session.page;
  let started: number;
  try {
    started = await sendChatGptPrompt(page, prompt, cfg.conversation.newChatEachRun ? undefined : cfg.conversation.conversationId,
      beforeSend ? baseline => beforeSend(prompt, { conversationId: cfg.conversation.newChatEachRun ? null : cfg.conversation.conversationId!, baseline }) : undefined);
  } catch (error) {
    if (!(error instanceof ChatGptSendError)) throw error;
    return error.code === "DISPATCH_AMBIGUOUS"
      ? { status: "ambiguous", submissionState: "unknown", reason: "SEND_OUTCOME_UNKNOWN", retryable: false, diagnostic: error.diagnostic }
      : { status: "unavailable", submissionState: "not_sent", reason: "PRE_SEND_NOT_READY", retryable: true, diagnostic: error.diagnostic };
  }

  // Returning a structured ambiguous receipt lets the existing generic Runner persist its replay guard.
  const notConfirmed = async () => {
    const error = await postClickAmbiguity(page, started, cfg.conversation.conversationId ?? null);
    return { status: "ambiguous", submissionState: "unknown", reason: "CONVERSATION_ID_NOT_CONFIRMED", retryable: false, diagnostic: error.diagnostic };
  };
  try {
    if (cfg.conversation.newChatEachRun) {
      await page.waitForURL(/\/c\/[0-9a-f-]{36}/i, { timeout: 8_000 });
    }
  } catch {
    return notConfirmed();
  }
  const transientUrl = page.url();
  const conversationId = conversationIdFromHref(transientUrl);
  if (!conversationId || (!cfg.conversation.newChatEachRun && conversationId !== cfg.conversation.conversationId)) return notConfirmed();
  const url = target.projectId ? projectConversationUrl(target.projectId, conversationId) : transientUrl;
  return { status: "triggered", submissionState: "submitted", url, conversationId };
}

// The Runner supplies this original receipt from private local storage.
async function resumeSend(session: BrowserSession, args: Record<string, unknown>) {
  const input = z.object({
    conversationId: conversationIdSchema,
    prompt: z.string().min(1),
    baseline: z.object({ bubbles: z.number().int().min(0), legacy: z.number().int().min(0) }),
  }).strict().parse(args);
  const url = `https://chatgpt.com/c/${input.conversationId}`;
  let navigated = false;
  const page = session.page;
  try {
    const navigation = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    navigated = true;
    const httpStatus = navigation?.status() ?? null;
    if (httpStatus === null || httpStatus < 200 || httpStatus >= 300) return {
      status: "unavailable", submissionState: "unknown", reason: "NAVIGATION_HTTP_ERROR",
      httpStatus, retryable: false, canResume: false,
    };
    const pageTitle = await page.title().catch(() => "");
    const challenge = /^(?:請稍候|请稍候|Just a moment|Checking your browser|Verify you are human)(?:[.!…。 ]|$)/i.test(pageTitle)
      || /Cloudflare.*(?:challenge|verification)/i.test(pageTitle);
    if (new URL(page.url()).origin !== "https://chatgpt.com"
      || conversationIdFromHref(page.url()) !== input.conversationId) return {
      status: "unavailable", submissionState: "unknown", retryable: false, canResume: false,
      reason: challenge ? "SITE_CHALLENGE" : "CONVERSATION_UNAVAILABLE",
    };
    // Challenge title is checked before deciding whether an unexpected URL is an ordinary redirect.
    if (challenge) return {
      // The origin and saved Conversation match, but the page is still a challenge.
      status: "unavailable", submissionState: "unknown", reason: "SITE_CHALLENGE",
      retryable: false, canResume: false,
    };
    let turnEvidence: unknown;
    const confirmed = await reconcileChatGptSend(page, input.prompt, input.conversationId, input.baseline,
      (evidence) => { turnEvidence = evidence; });
    return confirmed
      ? { status: "submitted", submissionState: "submitted", conversationId: input.conversationId, url }
      : { status: "pending", submissionState: "unknown", retryable: false, canResume: true,
        diagnostic: turnEvidence ? { turnEvidence } : undefined };
  } catch {
    return { status: "unavailable", submissionState: "unknown", retryable: false, canResume: false,
      reason: navigated ? "PAGE_UNAVAILABLE" : "NAVIGATION_FAILED" };
  }
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
    const generating = await isChatGptGenerationActive(page);

    state = advanceAssistantCollectScan(state, { assistantCount, latestText, generating }, Date.now(), input.settleMs);
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
    if (action === "trigger") return trigger(session, cfg, args, context.beforeSend);
    if (action === "resume") return resumeSend(session, args);
    if (action === "collect") return collect(session, cfg, args);
    throw new Error(`Unsupported chatgpt action: ${action}`);
  },
};
