import type { Locator, Page } from "playwright-core";

/** Provider-scoped contracts keep semantic recovery bounded and fail-closed. */
export type SemanticEditorContract = {
  css: string;
  roles: readonly ("textbox" | "combobox")[];
  sendWithinForm: string;
  /** Observation after dispatch may proceed while Send has become Stop. Never set before Send. */
  observationOnly?: boolean;
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
  let allAllowedRoles: Locator | null = null;
  for (const role of contract.roles) {
    const list = page.getByRole(role);
    if (typeof list?.count !== "function") return none();
    // Retain the live union of every permitted role; a second role may appear
    // between initial resolution and fill(). Strict mode must catch that race.
    allAllowedRoles = allAllowedRoles ? allAllowedRoles.or(list) : list;
    const found = await list.count().catch(() => -1);
    if (found < 0 || found > 1 || (found === 1 && candidate)) return none();
    // Keep the strict live Locator; .first() would silently retarget after a DOM remount.
    if (found === 1) candidate = list;
  }
  if (!candidate || !(await candidate.isVisible().catch(() => false))) return none();
  // AX says what it is; the live DOM decides whether insertion is permitted.
  if (!(await candidate.evaluate(node => (node as HTMLElement).isContentEditable).catch(() => false))) return none();
  const form = candidate.locator("xpath=ancestor::form[1]");
  if (await form.count().catch(() => -1) !== 1) return none();
  if (!contract.observationOnly && await form.locator(contract.sendWithinForm).count().catch(() => -1) !== 1) return none();
  // Re-acquisition must preserve the ownership/editability proof, not only the role.
  // Otherwise a replacement Search textbox can inherit the old role Locator and
  // receive the prompt after the initial validation but before fill().
  const editable = ':is([contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"])';
  const qualifiedCss = contract.observationOnly
    ? `form ${editable}`
    : `form:has(${contract.sendWithinForm}) ${editable}`;
  if (!allAllowedRoles || typeof allAllowedRoles.and !== "function") return none();
  const owned = allAllowedRoles.and(page.locator(qualifiedCss));
  if (await owned.count().catch(() => -1) !== 1) return none();
  return {matches:1,editor:owned,source:"aria"};
}
