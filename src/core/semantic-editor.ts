import type { Locator, Page } from "playwright-core";

/** Provider-scoped contracts keep semantic recovery bounded and fail-closed. */
export type SemanticEditorContract = {
  css: string;
  roles: readonly ("textbox" | "combobox")[];
  sendWithinForm: string;
};

export type SemanticEditorResolution = {
  matches: number;
  editor: Locator | null;
  source: "css" | "aria" | "ambiguous" | "none";
};

const none = (): SemanticEditorResolution => ({matches:0,editor:null,source:"none"});

export async function resolveSemanticEditor(page: Page, contract: SemanticEditorContract): Promise<SemanticEditorResolution> {
  const css = page.locator(contract.css);
  const count = await css.count().catch(() => -1);
  if (count < 0) return none();
  if (count > 1) return {matches:count,editor:null,source:"ambiguous"};
  if (count === 1) return {matches:1,editor:css.first(),source:"css"};

  if (typeof page.getByRole !== "function") return none();
  let candidate: Locator | null = null;
  for (const role of contract.roles) {
    const list = page.getByRole(role);
    if (typeof list?.count !== "function") return none();
    const found = await list.count().catch(() => -1);
    if (found < 0 || found > 1 || (found === 1 && candidate)) return none();
    if (found === 1) candidate = list.first();
  }
  if (!candidate || !(await candidate.isVisible().catch(() => false))) return none();
  // AX says what it is; the live DOM decides whether insertion is permitted.
  if (!(await candidate.evaluate(node => (node as HTMLElement).isContentEditable).catch(() => false))) return none();
  const form = candidate.locator("xpath=ancestor::form[1]");
  if (await form.count().catch(() => -1) !== 1) return none();
  if (await form.locator(contract.sendWithinForm).count().catch(() => -1) !== 1) return none();
  return {matches:1,editor:candidate,source:"aria"};
}
