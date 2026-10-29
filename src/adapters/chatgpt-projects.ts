import type { Page } from "playwright-core";
import { conversationIdFromHref, type ChatConversation } from "./chatgpt.js";

const PROJECTS_URL = "https://chatgpt.com/projects";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function chatGptPageFailure(url: string, title: string): string | null {
  if (/\/auth\/|login/i.test(url)) return "ChatGPT profile is not logged in; run harness_bootstrap first";
  if (/just a moment|\u8acb\u7a0d\u5019|checking your browser|verify you are human/i.test(title)) {
    return "ChatGPT presented an anti-bot challenge; headless execution may not be supported for this profile. Use browser.headless=false with browser.startMinimized=true, or run harness_bootstrap.";
  }
  return null;
}

async function pageFailure(page: Page): Promise<string | null> {
  return chatGptPageFailure(page.url(), await page.title().catch(() => ""));
}

export async function ensureProjectsPage(page: Page): Promise<void> {
  await page.goto(PROJECTS_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const firstFailure = await pageFailure(page);
  if (firstFailure) throw new Error(firstFailure);
  try {
    await page.locator("main").waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    const failure = await pageFailure(page);
    if (failure) throw new Error(failure);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    const reloadFailure = await pageFailure(page);
    if (reloadFailure) throw new Error(reloadFailure);
    try {
      await page.locator("main").waitFor({ state: "attached", timeout: 15_000 });
    } catch {
      const finalFailure = await pageFailure(page);
      if (finalFailure) throw new Error(finalFailure);
      throw new Error("ChatGPT projects UI did not become ready");
    }
  }
}

function rowName(rowText: string): string {
  const parts = rowText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

export type ProjectScanState = { hydrated: boolean; lastCount: number; stablePasses: number; done: boolean };

export function advanceProjectScan(
  state: Omit<ProjectScanState, "done"> | ProjectScanState,
  projectCount: number,
  rowCount: number,
): ProjectScanState {
  const hydrated = state.hydrated || projectCount > 0 || rowCount > 1;
  const stablePasses = hydrated && projectCount === state.lastCount ? state.stablePasses + 1 : 0;
  return { hydrated, lastCount: projectCount, stablePasses, done: hydrated && stablePasses >= 2 };
}

const MODERN_PROJECT_ROWS = 'main [data-projects-rows] [data-project-row]';
const LEGACY_PROJECT_ROWS = 'main [role="row"]';
const PROJECT_ID_PATTERN = /^g-p-[A-Za-z0-9_-]{1,120}$/;
const PROJECT_EDITOR = '#prompt-textarea:visible, [contenteditable="true"][role="textbox"]:visible';

async function modernProjectRowName(row: ReturnType<Page["locator"]>): Promise<string> {
  const spans = row.locator("span");
  const texts: string[] = [];
  for (let i = 0; i < await spans.count(); i++) {
    const value = (await spans.nth(i).innerText()).trim();
    if (value) texts.push(value);
  }
  // Current UI: empty icon span + a single readable Project name span.
  // Multiple text candidates fail closed rather than guessing.
  if (texts.length !== 1) throw new Error("PROJECTS_UI_AMBIGUOUS_ROW");
  return texts[0];
}

function checkedProjectId(raw: string | null, projectName: string): string {
  if (!raw) throw new Error("Project id missing in sidebar: " + projectName);
  if (!PROJECT_ID_PATTERN.test(raw)) throw new Error("Invalid UI Project id");
  return raw;
}

async function requireCanonicalProjectLanding(page: Page, projectId: string): Promise<void> {
  const expectedPath = "/g/" + projectId + "/project";
  const verify = () => {
    let url: URL;
    try { url = new URL(page.url()); } catch { throw new Error("Unexpected Project route"); }
    if (url.origin !== "https://chatgpt.com" || url.pathname !== expectedPath || url.search || url.hash) {
      throw new Error("Unexpected Project origin or route");
    }
  };
  verify();
  const editor = page.locator(PROJECT_EDITOR);
  try { await editor.first().waitFor({ state: "visible", timeout: 15_000 }); }
  catch { throw new Error("Project Composer unavailable"); }
  verify();
  if (await editor.count() !== 1 || !await editor.first().isEditable()) {
    throw new Error("Project Composer is not uniquely visible and editable");
  }
  verify();
}

async function navigateProjectLanding(page: Page, projectId: string): Promise<void> {
  await page.goto("https://chatgpt.com/g/" + projectId + "/project", {
    waitUntil: "domcontentloaded", timeout: 30_000,
  });
  const failure = await pageFailure(page);
  if (failure) throw new Error(failure);
  await requireCanonicalProjectLanding(page, projectId);
}

async function exactSidebarProjectId(page: Page, projectName: string): Promise<string> {
  const rows = page.locator("[data-app-action-sidebar-project-row]");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const labels: (string | null)[] = [];
    for (let i = 0; i < await rows.count(); i++) {
      labels.push(await rows.nth(i).getAttribute("data-app-action-sidebar-project-label"));
    }
    const index = resolveProjectRowIndex(labels, projectName);
    if (index !== null) {
      return checkedProjectId(await rows.nth(index).getAttribute("data-app-action-sidebar-project-id"), projectName);
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Project not found in sidebar: " + projectName);
}

export async function listProjects(page: Page): Promise<string[]> {
  await ensureProjectsPage(page);
  const names = new Set<string>();
  let state: ProjectScanState = { hydrated: false, lastCount: -1, stablePasses: 0, done: false };
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const modern = page.locator(MODERN_PROJECT_ROWS);
    const legacy = page.locator(LEGACY_PROJECT_ROWS);
    const modernCount = await modern.count();
    const oldCount = await legacy.count();
    if (modernCount > 0) {
      for (let i = 0; i < modernCount; i++) names.add(await modernProjectRowName(modern.nth(i)));
    } else {
      for (let i = 0; i < oldCount; i++) {
        const cells = legacy.nth(i).locator('[role="gridcell"]');
        if (!await cells.count()) continue;
        const name = rowName(await cells.first().innerText());
        if (name && !["名稱", "修改時間", "Name", "Modified"].includes(name)) names.add(name);
      }
    }
    state = advanceProjectScan(state, names.size, modernCount > 0 ? modernCount + 1 : oldCount);
    if (state.done) return [...names];
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
  }
  throw new Error("ChatGPT Projects UI not ready or not hydrated");
}

export async function openProject(page: Page, projectName: string): Promise<void> {
  await ensureProjectsPage(page);
  const modern = page.locator(MODERN_PROJECT_ROWS);
  const old = page.locator(LEGACY_PROJECT_ROWS);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const modernCount = await modern.count();
    if (modernCount > 0) {
      const matches: number[] = [];
      for (let i = 0; i < modernCount; i++) {
        if (await modernProjectRowName(modern.nth(i)) === projectName) matches.push(i);
      }
      if (matches.length > 1) throw new Error("Project name is ambiguous: " + projectName);
      if (matches.length === 1) {
        const projectId = await exactSidebarProjectId(page, projectName);
        await navigateProjectLanding(page, projectId);
        return;
      }
    } else {
      const matches: number[] = [];
      for (let i = 0; i < await old.count(); i++) {
        const cells = old.nth(i).locator('[role="gridcell"]');
        if (await cells.count() && rowName(await cells.first().innerText()) === projectName) matches.push(i);
      }
      if (matches.length > 1) throw new Error("Project name is ambiguous: " + projectName);
      if (matches.length === 1) {
        await old.nth(matches[0]).locator('[role="gridcell"]').first().click();
        await page.waitForURL(/\/g\/g-p-[A-Za-z0-9_-]{1,120}\/project(?:$|[?#])/, { timeout: 20_000 });
        const url = new URL(page.url());
        if (url.origin !== "https://chatgpt.com" || !/^\/g\/g-p-[A-Za-z0-9_-]{1,120}\/project$/.test(url.pathname)) {
          throw new Error("Unexpected Project origin or route");
        }
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Project not found: " + projectName);
}

export async function openConversation(page: Page, conversationId: string, projectScoped: boolean): Promise<void> {
  if (!projectScoped) {
    await page.goto(`https://chatgpt.com/c/${conversationId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!page.url().includes(`c/${conversationId}`)) throw new Error(`Conversation not found: ${conversationId}`);
    return;
  }

  const link = page.locator(`main a[href*="/c/${conversationId}"]`).first();
  await link.waitFor({ state: "attached", timeout: 10_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`Conversation link missing: ${conversationId}`);
  await page.goto(new URL(href, "https://chatgpt.com").toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!page.url().includes(`/c/${conversationId}`)) throw new Error(`Conversation not found in project: ${conversationId}`);
}

export function isProjectNewChatButtonLabel(label: string | null | undefined, projectName: string): boolean {
  if (!label || !label.includes(projectName)) return false;
  return /開始新對話|start(?: a)? new chat/i.test(label);
}

export function resolveProjectRowIndex(labels: readonly (string | null)[], projectName: string): number | null {
  const matches = labels.flatMap((label, index) => label === projectName ? [index] : []);
  if (matches.length > 1) throw new Error(`Project name is ambiguous: ${projectName}`);
  return matches[0] ?? null;
}

export function projectConversationUrl(projectId: string, conversationId: string): string {
  return `https://chatgpt.com/g/${projectId}/c/${conversationId}`;
}

export async function startProjectNewConversation(page: Page, projectName: string): Promise<{ projectId: string }> {
  await ensureProjectsPage(page);
  const projectId = await exactSidebarProjectId(page, projectName);
  await navigateProjectLanding(page, projectId);
  return { projectId };
}

export async function pinnedConversationIds(page: Page): Promise<Set<string>> {
  for (const label of ["已釘選", "Pinned"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    if (await button.count()) {
      try {
        if (await button.first().getAttribute("aria-expanded") === "false") await button.first().click();
      } catch {}
    }
  }

  const ids = new Set<string>();
  const links = page.locator('a[aria-label^="已釘選對話："],a[aria-label^="Pinned chat:"]');
  for (let i = 0; i < await links.count(); i++) {
    const id = conversationIdFromHref(await links.nth(i).getAttribute("href"));
    if (id) ids.add(id);
  }
  return ids;
}

export type ConversationScanState = { hydrated: boolean; lastCount: number; stablePasses: number; done: boolean };

export function advanceConversationScan(
  state: Omit<ConversationScanState, "done"> | ConversationScanState,
  conversationCount: number,
): ConversationScanState {
  const hydrated = state.hydrated || conversationCount > 0;
  const stablePasses = hydrated && conversationCount === state.lastCount ? state.stablePasses + 1 : 0;
  return { hydrated, lastCount: conversationCount, stablePasses, done: hydrated && stablePasses >= 2 };
}

export async function listProjectConversations(page: Page): Promise<ChatConversation[]> {
  const pinned = await pinnedConversationIds(page);
  const found = new Map<string, ChatConversation>();
  let state: ConversationScanState = { hydrated: false, lastCount: -1, stablePasses: 0, done: false };
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const links = page.locator('main a[href*="/c/"]');
    const linkCount = await links.count();
    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute("href");
      const id = conversationIdFromHref(href);
      if (!id || found.has(id)) continue;
      const text = (await link.innerText()).trim();
      found.set(id, { id, title: text.split(/\r?\n/)[0] || id, pinned: pinned.has(id), href: href ?? undefined });
    }
    state = advanceConversationScan(state, found.size);
    if (state.done) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
  }
  return [...found.values()];
}

export async function deleteConversation(page: Page, item: ChatConversation): Promise<"deleted" | "pinned-live" | "missing"> {
  const link = page.locator(`main a[href*="/c/${item.id}"]`).first();
  if (!await link.count()) return "missing";

  const trigger = page.locator(`[data-conversation-options-trigger="${item.id}"]`).first();
  if (await trigger.count()) {
    await trigger.click();
  } else {
    const parent = link.locator("xpath=..");
    const button = parent.locator("button").last();
    if (!await button.count()) throw new Error(`Conversation options not found: ${item.id}`);
    await button.click();
  }

  const menu = page.getByRole("menu");
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  if (await menu.getByRole("menuitem", { name: /\u53d6\u6d88\u91d8\u9078|Unpin/i }).count()) {
    await page.keyboard.press("Escape");
    return "pinned-live";
  }

  const del = menu.getByRole("menuitem", { name: /^(\u522a\u9664|Delete)$/i });
  if (!await del.count()) throw new Error(`Delete menu item not found: ${item.id}`);
  await del.click();

  const dialog = page.getByRole("dialog").filter({ hasText: /\u522a\u9664\u804a\u5929|Delete chat/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 });
  await dialog.getByRole("button", { name: /^(\u522a\u9664|Delete)$/i }).click();
  await sleep(200);

  try {
    await link.waitFor({ state: "detached", timeout: 10_000 });
  } catch {
    throw new Error(`Conversation still present after deletion: ${item.id}`);
  }
  return "deleted";
}
