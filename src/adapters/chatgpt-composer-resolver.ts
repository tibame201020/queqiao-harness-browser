import type { Locator, Page } from "playwright-core";

// Native Playwright locators re-resolve against the current accessibility/DOM tree.
// This is a bounded fallback, not a substitute for the existing Send contract.
export const CHATGPT_COMPOSER_CSS =
  '#prompt-textarea:visible, [role="textbox"][contenteditable="true"]:visible';
export const CHATGPT_FORM_SEND_CSS = '[data-testid="send-button"], button[type="submit"]';

export type ComposerResolution = {
  matches: number;
  composer: Locator | null;
  source: "css" | "aria" | "ambiguous" | "none";
};

export async function resolveChatGptComposer(page: Page): Promise<ComposerResolution> {
  const css = page.locator(CHATGPT_COMPOSER_CSS);
  const cssCount = await css.count().catch(() => 0);
  if (cssCount > 0) {
    return cssCount === 1
      ? { matches:1, composer:css.first(), source:"css" }
      : { matches:cssCount, composer:null, source:"ambiguous" };
  }

  // Do not select by arbitrary text/position. Only a unique native accessible
  // textbox inside a form containing exactly one known Send control can recover.
  if (typeof page.getByRole !== "function") return {matches:0,composer:null,source:"none"};
  const role = page.getByRole("textbox");
  if (typeof role?.count !== "function") return {matches:0,composer:null,source:"none"};
  if (await role.count().catch(() => 0) !== 1) return {matches:0,composer:null,source:"none"};
  const candidate = role.first();
  if (!(await candidate.isVisible().catch(() => false))) return {matches:0,composer:null,source:"none"};
  const contenteditable = await candidate.evaluate((node) => (node as HTMLElement).isContentEditable).catch(() => false);
  if (!contenteditable) return {matches:0,composer:null,source:"none"};
  const form = candidate.locator("xpath=ancestor::form[1]");
  if (await form.count().catch(() => 0) !== 1) return {matches:0,composer:null,source:"none"};
  if (await form.locator(CHATGPT_FORM_SEND_CSS).count().catch(() => 0) !== 1)
    return {matches:0,composer:null,source:"none"};
  return {matches:1,composer:candidate,source:"aria"};
}
