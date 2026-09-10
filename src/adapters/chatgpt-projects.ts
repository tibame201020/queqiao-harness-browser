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

export async function listProjects(page: Page): Promise<string[]> {
  await ensureProjectsPage(page);
  const names = new Set<string>();
  let state: ProjectScanState = { hydrated: false, lastCount: -1, stablePasses: 0, done: false };
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = page.locator('main [role="row"]');
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('[role="gridcell"]');
      if (!await cells.count()) continue;
      const name = rowName(await cells.first().innerText());
      if (name && !["\u540d\u7a31", "\u4fee\u6539\u6642\u9593", "Name", "Modified"].includes(name)) names.add(name);
    }
    state = advanceProjectScan(state, names.size, rowCount);
    if (state.done) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
  }
  return [...names];
}

export async function openProject(page: Page, projectName: string): Promise<void> {
  await ensureProjectsPage(page);
  await page.locator('main [role="row"]').first().waitFor({ state: "attached", timeout: 20_000 });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = page.locator('main [role="row"]');
    const matches: number[] = [];
    for (let i = 0; i < await rows.count(); i++) {
      const cells = rows.nth(i).locator('[role="gridcell"]');
      if (await cells.count() && rowName(await cells.first().innerText()) === projectName) matches.push(i);
    }
    if (matches.length > 1) throw new Error(`Project name is ambiguous: ${projectName}`);
    if (matches.length === 1) {
      await rows.nth(matches[0]).locator('[role="gridcell"]').first().click();
      await page.waitForURL(/\/g\/g-p-[^/]+\/project(?:$|[?#])/, { timeout: 20_000 });
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Project not found: ${projectName}`);
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
