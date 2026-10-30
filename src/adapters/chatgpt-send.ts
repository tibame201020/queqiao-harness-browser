import type { Locator, Page } from "playwright-core";
import { createHmac, randomBytes } from "node:crypto";
import { conversationIdFromHref } from "./chatgpt.js";

const COMPOSER = '#prompt-textarea:visible, [role="textbox"][contenteditable="true"]:visible';
const FORM_SEND = '[data-testid="send-button"], button[type="submit"]';
const FORM_SEND_VISIBLE = '[data-testid="send-button"]:visible, button[type="submit"]:visible';
const LEGACY_SEND = '[data-testid="send-button"]';
const LEGACY_SEND_VISIBLE = '[data-testid="send-button"]:visible';
const USER_BUBBLES = '[data-user-message-bubble="true"]';
const LEGACY_USER_TURNS = '[data-message-author-role="user"]';
const POST_CLICK_MAX_MS = 5_000;
const POST_CLICK_MIN_MS = 3_000;
const POST_CLICK_STABLE_MS = 600;
// Permit a bounded dwell extension ONLY after an attributable User Turn and empty editor are verified.
const POST_CLICK_PROVEN_GRACE_MS = 1_500;
// Only an owned provisional first-chat User Turn may extend observation until ChatGPT saves a canonical ID.
const POST_CLICK_PENDING_SAVE_MAX_MS = 12_000;
const GENERATION = [
  '[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label="停止產生"]',
  'button[aria-label="停止生成"]',
];

type Stage = "precompose" | "presend" | "click" | "postclick";
type SendSelection = { locator: Locator | null; selector: "form" | "legacy" | "none"; count: number; visibleCount: number };
type TurnCountSnapshot = { bubbles: number; legacy: number };
type PostClickTurnEvidence = {
  before: TurnCountSnapshot;
  current: TurnCountSnapshot;
  min: TurnCountSnapshot;
  max: TurnCountSnapshot;
  checks: number;
  observedNewTurn: boolean;
  verifiedNewTurn: boolean;
  sameCountLastMatchesOriginal: boolean;
  sameCountLastChanged: boolean;
  hydration: {
    canonicalCandidateSeen: boolean;
    transientMultipleObserved: boolean;
    emptyAfterMultipleObserved: boolean;
    savedUniqueTurnVerified: boolean;
    extendedObservation: boolean;
  };
  folded: {
    previewCorrelated: boolean;
    expandControlMax: number;
    expandAttempts: number;
    expandClickSucceeded: boolean;
    expandedFullTextMatched: boolean;
    canonicalSavedIdSeen: boolean;
    originalProjectMembership: "not_checked" | "confirmed" | "rejected";
  };
  // Count and categorical outcome only; no message content or DOM in diagnostics.
  messageInspection?: {
    family: "bubble" | "legacy";
    contentMatches: number;
    outermostMatches: number;
    readOutcome: "read" | "read_failed" | "ambiguous_content" | "selector_failed";
    provisionalFirstChat: boolean;
  };
  samples: { bubbles: number; legacy: number; correctTarget: boolean; editorEmpty: boolean; generationActive: boolean }[];
};

type Readiness = {
  stage: Stage;
  elapsedMs: number;
  url: string;
  conversationId: string | null;
  sameTarget: boolean;
  generationActive: boolean;
  composerMatches: number;
  composerVisible: boolean;
  composerEditable: boolean;
  promptPresent: boolean | null;
  promptIntegrity: "complete" | "empty" | "truncated" | "mismatch" | "unverifiable" | null;
  precomposeReason: "draft_present" | "editor_read_failed" | "composer_click_failed" | null;
  sendSelector: SendSelection["selector"];
  sendMatches: number;
  sendVisibleMatches: number;
  sendVisible: boolean;
  sendEnabled: boolean;
  sendActionable: boolean;
  submissionConfirmed: boolean | null;
  composerSettled: boolean | null;
  turnEvidence?: PostClickTurnEvidence;
  postClickReason: "target_unconfirmed" | "new_turn_absent" | "message_unavailable"
    | "folded_prefix_mismatch" | "expand_control_missing" | "expand_click_failed"
    | "expanded_text_mismatch" | "full_text_mismatch" | "composer_not_settled" | "stabilizing" | null;
};

function safeUrl(page: Page): { url: string; id: string | null } {
  try {
    const parsed = new URL(page.url());
    if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") return { url: "unexpected-origin", id: null };
    // Never retain query/hash: URLs can contain transient parameters.
    return { url: parsed.origin + parsed.pathname, id: conversationIdFromHref(parsed.pathname) };
  } catch {
    return { url: "invalid-url", id: null };
  }
}

export async function isChatGptGenerationActive(page: Page): Promise<boolean> {
  for (const selector of GENERATION) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return true;
  }
  return false;
}

async function selectSend(page: Page, composer: Locator | null, composerMatches: number): Promise<SendSelection> {
  if (composer && composerMatches === 1) {
    const form = composer.locator('xpath=ancestor::form[1]');
    if (await form.count().catch(() => 0)) {
      const inForm = form.locator(FORM_SEND);
      const count = await inForm.count().catch(() => 0);
      if (count) {
        const visible = form.locator(FORM_SEND_VISIBLE);
        const visibleCount = await visible.count().catch(() => 0);
        const locator = visibleCount === 1 ? visible.first() : (count === 1 ? inForm.first() : null);
        return { locator, selector: "form", count, visibleCount };
      }
    }
  }
  // Count raw legacy matches even when hidden or the composer is missing (diagnostic only).
  const legacy = page.locator(LEGACY_SEND);
  const count = await legacy.count().catch(() => 0);
  const visible = page.locator(LEGACY_SEND_VISIBLE);
  const visibleCount = await visible.count().catch(() => 0);
  const locator = composerMatches === 1 && composer && (
    visibleCount === 1 ? visible.first() : (count === 1 ? legacy.first() : null)
  ) || null;
  return { locator, selector: count ? "legacy" : "none", count, visibleCount };
}

function sameTarget(page: Page, expectedId: string | null, initialId: string | null): boolean {
  const current = safeUrl(page);
  return current.url !== "unexpected-origin" && current.url !== "invalid-url"
    && (!expectedId || current.id === expectedId)
    && current.id === initialId;
}

type PromptIntegrity = Exclude<Readiness["promptIntegrity"], null>;

/** Rebuild semantic editor line breaks from contenteditable blocks, not innerText spacing or textContent concatenation. */
async function inspectPromptIntegrity(composer: Locator, prompt: string): Promise<PromptIntegrity> {
  // The reconstructed text exists only transiently in memory. It is never returned in receipts or diagnostics.
  const actual = await composer.evaluate((root): string | null => {
    const content = [...root.childNodes];
    const isBlock = (n: Node) => n.nodeType === Node.ELEMENT_NODE
      && ["P", "DIV"].includes((n as Element).tagName);
    const textInside = (n: Node): string => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
      if (n.nodeType !== Node.ELEMENT_NODE) return "";
      const el = n as Element;
      if (el.tagName === "BR") return "\n";
      return [...el.childNodes].map(textInside).join("");
    };
    if (content.length && content.every(isBlock)) {
      return content.map((block) => {
        // An empty ProseMirror paragraph contains a placeholder BR, not one typed newline.
        if (block.childNodes.length === 1 && (block.firstChild as Element).tagName === "BR") return "";
        return [...block.childNodes].map(textInside).join("");
      }).join("\n");
    }
    // Mixed blocks and inline nodes cannot be reconstructed unambiguously: fail closed.
    if (content.some(isBlock)) return null;
    return content.map(textInside).join("");
  }).catch(() => null);
  if (actual === null) return "unverifiable";
  const canonical = (value: string) => value.replace(/\r\n?/g, "\n");
  const observed = canonical(actual);
  const intended = canonical(prompt);
  if (observed === intended) return "complete";
  if (!observed) return "empty";
  if (intended.startsWith(observed)) return "truncated";
  return "mismatch";
}

async function inspect(page: Page, stage: Stage, started: number, initialId: string | null,
  expectedId: string | null, prompt?: string): Promise<{ state: Readiness; composer: Locator | null; send: Locator | null }> {
  const composers = page.locator(COMPOSER);
  const composerMatches = await composers.count().catch(() => 0);
  const composer = composerMatches === 1 ? composers.first() : null;
  const composerVisible = !!composer && await composer.isVisible().catch(() => false);
  const composerEditable = composerVisible && !!composer && await composer.isEditable().catch(() => false);
  const promptIntegrity = prompt === undefined ? null : composer ? await inspectPromptIntegrity(composer, prompt) : "unverifiable";
  const promptPresent = promptIntegrity === null ? null : promptIntegrity === "complete";
  const selection = await selectSend(page, composer, composerMatches);
  const sendVisible = !!selection.locator && await selection.locator.isVisible().catch(() => false);
  const sendEnabled = sendVisible && !!selection.locator && await selection.locator.isEnabled().catch(() => false);
  const current = safeUrl(page);
  const state: Readiness = {
    stage, elapsedMs: Math.max(0, Date.now() - started), url: current.url, conversationId: current.id,
    sameTarget: sameTarget(page, expectedId, initialId),
    generationActive: await isChatGptGenerationActive(page),
    composerMatches, composerVisible, composerEditable, promptPresent, promptIntegrity, precomposeReason: null,
    sendSelector: selection.selector, sendMatches: selection.count, sendVisibleMatches: selection.visibleCount,
    sendVisible, sendEnabled, sendActionable: false,
    submissionConfirmed: null, composerSettled: null, postClickReason: null,
  };
  return { state, composer, send: selection.locator };
}

export class ChatGptSendError extends Error {
  constructor(
    readonly code: "PRE_SEND_NOT_READY" | "DISPATCH_AMBIGUOUS",
    readonly diagnostic: Readiness,
  ) {
    // Only fixed-schema booleans/counts/stages and a stripped URL; never prompt, DOM, cookies or trace.
    super(`${code} ${JSON.stringify(diagnostic)}`);
    this.name = "ChatGptSendError";
  }
}

function diagnostic(code: ChatGptSendError["code"], state: Readiness): ChatGptSendError {
  return new ChatGptSendError(code, state);
}

export async function postClickAmbiguity(page: Page, started: number, expectedId: string | null): Promise<ChatGptSendError> {
  const current = safeUrl(page);
  return diagnostic("DISPATCH_AMBIGUOUS", (await inspect(page, "postclick", started, current.id, expectedId)).state);
}

function sameSubmittedText(actual: string, expected: string): boolean {
  // Rendering can normalize paragraph whitespace. The pre-send check already verifies exact editor integrity.
  const semantic = (value: string) => value.replace(/[\s\u00a0]+/gu, " ").trim();
  return semantic(actual) === semantic(expected);
}

/**
 * Source Markdown is not a source-preserving representation of ChatGPT's rendered
 * user bubble. Accept only a small, deletion-only representation difference,
 * never a substituted or inserted content span. Caller must prove a single new User Turn,
 * a formatted code DOM node, the target conversation and a settled editor.
 * Raw prompt and rendered text never enter a receipt.
 */
function correlatedFormattedRender(rendered: string, source: string): boolean {
  const normalize = (v: string) => v.replace(/[\s\u00a0]+/gu, " ").trim();
  const a = normalize(rendered);
  const b = normalize(source);
  if (a.length < 256 || b.length < 256) return false;
  // The real authenticated code-block reproductions omitted exactly 12 source characters.
  // Do not equate 85% matching context with original content integrity.
  const missing = b.length - a.length;
  if (missing <= 0 || missing > 24) return false;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  if (prefix < 64 || suffix < 64) return false;
  // The entire rendered message must be an ordered subsequence of the original,
  // with at most 24 source-only characters. Even a same-length content replacement fails.
  let sourceIndex = 0;
  let renderedIndex = 0;
  let omitted = 0;
  while (sourceIndex < b.length && renderedIndex < a.length) {
    if (b[sourceIndex] === a[renderedIndex]) {
      sourceIndex++;
      renderedIndex++;
    } else {
      sourceIndex++;
      if (++omitted > 24) return false;
    }
  }
  return renderedIndex === a.length && omitted + b.length - sourceIndex === missing;
}

/** Only strip verified single-backtick inline-code delimiters; never infer arbitrary render edits. */
function expectedInlineCodePresentation(source: string): { rendered: string; codeText: string[] } | null {
  if (source.includes("```")) return null;
  const tokens = [...source.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)];
  if (tokens.length === 0 || tokens.length > 500) return null;
  if ((source.match(/`/g) ?? []).length !== tokens.length * 2) return null;
  return {
    rendered: source.replace(/(?<!`)`([^`\r\n]+)`(?!`)/g, "$1"),
    codeText: tokens.map((token) => token[1]),
  };
}
/** Read-only membership evidence: a canonical alias must appear in the original UI-selected Project. */
async function savedConversationInOriginalProject(page: Page, projectId: string, conversationId: string): Promise<boolean> {
  let probe: Page | null = null;
  try {
    probe = await page.context().newPage();
    const landing = "https://chatgpt.com/g/" + projectId + "/project";
    await probe.goto(landing, { waitUntil: "domcontentloaded", timeout: 10_000 });
    if (safeUrl(probe).url !== landing) return false;
    const links = probe.locator('main a[href*="/c/' + conversationId + '"]');
    await links.first().waitFor({ state: "attached", timeout: 6_000 });
    if (await links.count() !== 1) return false;
    const href = await links.first().getAttribute("href");
    if (!href) return false;
    const resolved = new URL(href, "https://chatgpt.com");
    return resolved.origin === "https://chatgpt.com" && !resolved.search && !resolved.hash
      && /^\/g\/g-p-[A-Za-z0-9_-]{1,120}\/c\/[0-9a-f-]{36}$/i.test(resolved.pathname)
      && conversationIdFromHref(resolved.pathname) === conversationId;
  } catch { return false; }
  finally { await probe?.close().catch(() => {}); }
}
/** After transient 2+ User bubbles, verify the saved server-rendered Conversation in a distinct read-only tab. */
async function verifyUniqueSavedProjectTurn(page: Page, canonicalUrl: string, prompt: string): Promise<boolean> {
  if (!/^https:\/\/chatgpt\.com\/g\/g-p-[A-Za-z0-9_-]{1,120}\/c\/[0-9a-f-]{36}$/i.test(canonicalUrl)) return false;
  let probe: Page | null = null;
  try {
    probe = await page.context().newPage();
    await probe.goto(canonicalUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
    if (safeUrl(probe).url === "unexpected-origin") return false;
    const expectedId = conversationIdFromHref(canonicalUrl);
    const users = probe.locator(USER_BUBBLES);
    const verified = async (): Promise<boolean> => {
      const actual = safeUrl(probe!);
      // React can rewrite the Project route alias during read-only hydration.
      // The saved Conversation UUID (plus original Project membership) is its identity.
      if (actual.id !== expectedId || !/^https:\/\/chatgpt\.com\/g\/g-p-[A-Za-z0-9_-]{1,120}\/c\/[0-9a-f-]{36}$/i.test(actual.url)) return false;
      if (await users.count() !== 1) return false;
      const turn = users.first();
      const roots = turn.locator(".whitespace-pre-wrap:not(.whitespace-pre-wrap .whitespace-pre-wrap)");
      if (await roots.count() !== 1) return false;
      let full = await roots.first().innerText({ timeout: 1_000 }).catch(() => null);
      if (typeof full === "string" && !sameSubmittedText(full, prompt) && prompt.length > 10_240) {
        const more = turn.getByRole("button", { name: /^(?:Show more|See more|顯示較多|顯示更多|显示更多)$/i });
        if (await more.count().catch(() => 0) === 1) {
          await more.click({ timeout: 1_000 }).catch(() => {});
          full = await roots.first().innerText({ timeout: 1_000 }).catch(() => null);
        }
      }
      return typeof full === "string" && sameSubmittedText(full, prompt);
    };
    // A saved Conversation can hydrate 0→2→1 after a read-only navigation.
    // Only the final one complete persisted User message matters.
    for (let check = 0; check < 40; check++) {
      if (await verified()) {
        await probe.waitForTimeout(600);
        if (await verified()) return true;
      }
      await probe.waitForTimeout(300);
    }
    return false;
  } catch { return false; }
  finally { await probe?.close().catch(() => {}); }
}

/**
 * Reconcile the SAME first-Project click after its live DOM loses attributable bubbles.
 * Use the observed canonical URL and original pre-click Project ID; no new Send.
 */
export async function reconcileOriginalProjectAttempt(page: Page, originalProjectId: string,
  originalPrompt: string, observedCanonicalUrl: string): Promise<boolean> {
  const route = /^https:\/\/chatgpt\.com\/g\/g-p-[A-Za-z0-9_-]{1,120}\/c\/([0-9a-f-]{36})$/i.exec(observedCanonicalUrl);
  if (!/^g-p-[A-Za-z0-9_-]{1,120}$/.test(originalProjectId) || !route) return false;
  const savedId = conversationIdFromHref(observedCanonicalUrl);
  if (!savedId || savedId !== route[1].toLowerCase()) return false;
  // Reuse existing first-party Project and unique saved message checks.
  // The live post-click bubble count may be 0, 1 or 2 during React hydration.
  const [membership, message] = await Promise.all([
    savedConversationInOriginalProject(page, originalProjectId, savedId),
    verifyUniqueSavedProjectTurn(page, observedCanonicalUrl, originalPrompt),
  ]);
  return membership && message;
}

/** Keep the same Browser Session open until this particular submitted User Turn is visible and its editor settles. */
async function awaitPostClickSettlement(page: Page, prompt: string, started: number, initialId: string | null,
  expectedId: string | null, beforeUserTurns: { bubbles: number; legacy: number },
  onEvidence?: (value: PostClickTurnEvidence) => void, firstChatProjectId?: string): Promise<void> {
  const clickedAt = Date.now();
  const evidence: PostClickTurnEvidence = {
    before: { ...beforeUserTurns },
    current: { ...beforeUserTurns },
    min: { ...beforeUserTurns },
    max: { ...beforeUserTurns },
    checks: 0,
    observedNewTurn: false,
    verifiedNewTurn: false,
    sameCountLastMatchesOriginal: false,
    sameCountLastChanged: false,
    hydration: {
      canonicalCandidateSeen: false, transientMultipleObserved: false,
      emptyAfterMultipleObserved: false, savedUniqueTurnVerified: false, extendedObservation: false,
    },
    folded: {
      previewCorrelated: false, expandControlMax: 0, expandAttempts: 0,
      expandClickSucceeded: false, expandedFullTextMatched: false,
      canonicalSavedIdSeen: false, originalProjectMembership: "not_checked",
    },
    samples: [],
  };
  let stableSince: number | null = null;
  const fingerprintKey = onEvidence ? randomBytes(32) : null;
  let lastSeenFingerprint: string | null = null;
  let expansionAttempts = 0;
  let foldedCandidateObserved = false;
  let expandedMatchObserved = false;
  let expansionClickSucceeded = false;
  let maxExpandControls = 0;
  let ownedProvisionalUrl: string | null = null;
  let provisionalAliasSeen = false;
  let membershipCheckedId: string | null = null;
  let transientMultipleObserved = false;
  let emptyAfterMultipleObserved = false;
  while (true) {
    const snapshot = await inspect(page, "postclick", started, initialId, expectedId);
    const currentId = safeUrl(page).id;
    const canonicalRoute = /^https:\/\/chatgpt\.com\/g\/(g-p-[A-Za-z0-9_-]{1,120})\/c\/([0-9a-f-]{36})$/i.exec(snapshot.state.url);
    const canonicalProjectCandidate = !!firstChatProjectId && initialId === null && expectedId === null
      && !!canonicalRoute && canonicalRoute[2].toLowerCase() === currentId;
    const strictTarget = expectedId
      ? currentId === expectedId && initialId === expectedId
      : currentId !== null && (initialId === null || currentId === initialId)
        && (!firstChatProjectId || snapshot.state.url ===
          "https://chatgpt.com/g/" + firstChatProjectId + "/c/" + currentId);
    let targetValid = strictTarget && !provisionalAliasSeen;
    // New-chat / -> /c/{id} is the expected first-Send navigation. Pre-click remains strict.
    snapshot.state.sameTarget = targetValid;
    // A provisional local UUID is never a saved Conversation ID.
    // Project preview is owned only when its ID matches the pre-click landing.
    const provisionalRoute = /^https:\/\/chatgpt\.com\/(?:g\/(g-p-[A-Za-z0-9_-]{1,120})\/)?c\/local-chatgpt%3A[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.exec(snapshot.state.url);
    const provisionalFirstChat = initialId === null && expectedId === null && !!provisionalRoute
      && (!!firstChatProjectId === !!provisionalRoute[1]);
    if (provisionalFirstChat && firstChatProjectId && provisionalRoute[1] !== firstChatProjectId) {
      provisionalAliasSeen = true;
      targetValid = false;
    }
    // Current ChatGPT renders a user bubble without the former author-role attribute.
    // Select one family, never count nested old/new wrappers as two User Turns.
    const bubbles = page.locator(USER_BUBBLES);
    const bubbleCount = await bubbles.count().catch(() => -1);
    const useBubbles = bubbleCount > 0;
    const turns = useBubbles ? bubbles : page.locator(LEGACY_USER_TURNS);
    const legacyCount = await page.locator(LEGACY_USER_TURNS).count().catch(() => -1);
    const turnCount = useBubbles ? bubbleCount : legacyCount;
    const priorCount = useBubbles ? beforeUserTurns.bubbles : beforeUserTurns.legacy;
    if (firstChatProjectId && initialId === null && expectedId === null && priorCount === 0
      && turnCount > 1 && (canonicalProjectCandidate || provisionalFirstChat)) transientMultipleObserved = true;
    if (transientMultipleObserved && turnCount === 0) emptyAfterMultipleObserved = true;
    const membershipRequired = canonicalProjectCandidate && (provisionalAliasSeen
      || canonicalRoute![1] !== firstChatProjectId || transientMultipleObserved);
    // Count-preserving churn is evidence of ambiguity, never submission proof.
    // Fingerprints use an ephemeral private HMAC key and never enter receipts.
    if (fingerprintKey && targetValid && priorCount > 0 && turnCount === priorCount && evidence.checks % 4 === 0) {
      const last = turns.nth(turnCount - 1);
      const contents = last.locator(".whitespace-pre-wrap");
      const count = await contents.count().catch(() => -1);
      const message = count === 1 ? contents.first() : count === 0 ? last : null;
      const shown = message ? await message.innerText({ timeout: 500 }).catch(() => null) : null;
      if (typeof shown === "string") {
        evidence.sameCountLastMatchesOriginal ||= sameSubmittedText(shown, prompt);
        const fingerprint = createHmac("sha256", fingerprintKey).update(shown).digest("hex");
        evidence.sameCountLastChanged ||= lastSeenFingerprint !== null && lastSeenFingerprint !== fingerprint;
        lastSeenFingerprint = fingerprint;
      }
    }
    let newTurnMatches = false;
    evidence.messageInspection = undefined;
    let reason: Readiness["postClickReason"] = targetValid ? "new_turn_absent" : "target_unconfirmed";
    if ((targetValid || provisionalFirstChat || canonicalProjectCandidate)
      && turnCount === priorCount + 1 && priorCount >= 0) {
      const turn = turns.nth(turnCount - 1);
      // Prefer the actual bubble content, excluding copy/edit buttons owned by the outer turn.
      const contents = turn.locator(".whitespace-pre-wrap");
      const count = await contents.count().catch(() => -1);
      // One User bubble can contain nested whitespace-preserving spans.
      // Only a unique outermost root is safe; sibling roots remain ambiguous.
      const outermost = count > 1
        ? turn.locator(".whitespace-pre-wrap:not(.whitespace-pre-wrap .whitespace-pre-wrap)")
        : null;
      const outermostMatches = outermost ? await outermost.count().catch(() => -1) : count;
      const message = count === 0 ? turn : count === 1 ? contents.first()
        : outermostMatches === 1 ? outermost!.first() : null;
      const observed = message ? await message.innerText({ timeout: 500 }).catch(() => null) : null;
      evidence.messageInspection = {
        family: useBubbles ? "bubble" : "legacy",
        contentMatches: count,
        outermostMatches,
        readOutcome: count < 0 || outermostMatches < 0 ? "selector_failed"
          : count > 1 && outermostMatches !== 1 ? "ambiguous_content"
          : typeof observed === "string" ? "read" : "read_failed",
        provisionalFirstChat,
      };
      reason = typeof observed === "string" ? "full_text_mismatch" : "message_unavailable";
      const hasFormattedCode = !!message && await message.locator("pre code").count().catch(() => 0) > 0;
      const inlineSource = expectedInlineCodePresentation(prompt);
      const confirmsContent = async (actual: string | null): Promise<boolean> => {
        if (typeof actual !== "string") return false;
        if (sameSubmittedText(actual, prompt)) return true;
        if (hasFormattedCode && correlatedFormattedRender(actual, prompt)) return true;
        if (!message || !inlineSource) return false;
        const inline = message.locator("code:not(pre code)");
        if (await inline.count().catch(() => -1) !== inlineSource.codeText.length) return false;
        const shown = await inline.allInnerTexts().catch(() => null);
        return !!shown && shown.length === inlineSource.codeText.length
          && inlineSource.codeText.every((part, i) => sameSubmittedText(shown[i], part))
          && sameSubmittedText(actual, inlineSource.rendered);
      };


      newTurnMatches = await confirmsContent(observed);
      const semantic = (value: string) => value.replace(/[\s\u00a0]+/gu, " ").trim();
      const source = semantic(prompt);
      const preview = typeof observed === "string" ? semantic(observed) : "";
      // Correlated folded previews can justify bounded *observation only*.
      // Never treat a folded prefix as submission proof, even with a canonical ID.
      const foldedPreview = !!firstChatProjectId && source.length > 10_240
        && preview.length >= 10_000 && preview.length <= 10_300
        && preview.length < source.length
        && source.slice(0, 10_000) === preview.slice(0, 10_000);
      foldedCandidateObserved ||= foldedPreview;
      if (!newTurnMatches && foldedPreview) reason = "expand_control_missing";
      if (!newTurnMatches && typeof observed === "string" && message && expansionAttempts < 4) {
        // ChatGPT can collapse long User bubbles at 10,240 visible characters.
        // Folded UI can differ from the complete semantic content. Only the newly added
        // User Turn may be expanded; exact content or conservative structured Markdown correlation is required.
        const showMore = turn.getByRole("button", { name: /^(?:Show more|See more|顯示較多|顯示更多|显示更多)$/i });
        const expansionControls = await showMore.count().catch(() => -1);
        maxExpandControls = Math.max(maxExpandControls, expansionControls);
        if (expansionControls !== 1) reason = expansionClickSucceeded ? "expanded_text_mismatch" : "expand_control_missing";
        if (expansionControls === 1) {
          reason = "expand_click_failed";
          expansionAttempts++;
          if (await showMore.click({ timeout: 1_000 }).then(() => true).catch(() => false)) {
            expansionClickSucceeded = true;
            const expanded = await message.innerText({ timeout: 500 }).catch(() => null);
            newTurnMatches = await confirmsContent(expanded);
            if (newTurnMatches) expandedMatchObserved = true;
            reason = newTurnMatches ? "stabilizing" : "expanded_text_mismatch";
          }
        }
      }
    }
    const editor = snapshot.composer;
    let editorEmpty = false;
    if (editor && snapshot.state.composerMatches === 1 && snapshot.state.composerVisible) {
      const [rendered, raw] = await Promise.all([
        editor.innerText({ timeout: 500 }).catch(() => null),
        editor.textContent({ timeout: 500 }).catch(() => null),
      ]);
      editorEmpty = typeof rendered === "string" && typeof raw === "string"
        && !rendered.trim() && !raw.trim();
    }
    evidence.checks++;
    evidence.current = { bubbles: bubbleCount, legacy: legacyCount };
    for (const kind of ["bubbles", "legacy"] as const) {
      const value = evidence.current[kind];
      if (value >= 0) {
        evidence.min[kind] = Math.min(evidence.min[kind], value);
        evidence.max[kind] = Math.max(evidence.max[kind], value);
      }
    }
    evidence.observedNewTurn ||= priorCount >= 0 && turnCount === priorCount + 1;
    evidence.verifiedNewTurn ||= newTurnMatches;
    evidence.hydration = {
      ...evidence.hydration,
      canonicalCandidateSeen: evidence.hydration.canonicalCandidateSeen || canonicalProjectCandidate,
      transientMultipleObserved, emptyAfterMultipleObserved,
    };
    evidence.folded = {
      previewCorrelated: foldedCandidateObserved,
      expandControlMax: maxExpandControls,
      expandAttempts: expansionAttempts,
      expandClickSucceeded: expansionClickSucceeded,
      expandedFullTextMatched: expandedMatchObserved,
      canonicalSavedIdSeen: !!canonicalProjectCandidate,
      originalProjectMembership: evidence.folded.originalProjectMembership,
    };
    evidence.samples.push({
      bubbles: bubbleCount, legacy: legacyCount,
      correctTarget: targetValid, editorEmpty, generationActive: snapshot.state.generationActive,
    });
    // Keep two earliest and six latest state observations; never include messages, DOM or URL.
    if (evidence.samples.length > 8) evidence.samples.splice(2, 1);
    snapshot.state.turnEvidence = {
      ...evidence, before: { ...evidence.before }, current: { ...evidence.current },
      min: { ...evidence.min }, max: { ...evidence.max },
      samples: evidence.samples.map(item => ({ ...item })),
    };
    onEvidence?.(snapshot.state.turnEvidence!);
    // Provisional local-chatgpt IDs are NOT saved Conversation IDs and never confirm Send.
    snapshot.state.submissionConfirmed = targetValid && newTurnMatches;
    snapshot.state.composerSettled = editorEmpty;
    snapshot.state.postClickReason = (!targetValid && !membershipRequired && !provisionalFirstChat)
      ? "target_unconfirmed"
      : newTurnMatches ? editorEmpty ? "stabilizing" : "composer_not_settled" : reason;
    const now = Date.now();
    if (provisionalFirstChat && newTurnMatches && editorEmpty) {
      ownedProvisionalUrl ??= snapshot.state.url;
    }
    if ((targetValid || membershipRequired) && newTurnMatches && editorEmpty) {
      stableSince ??= now;
      // One owned message and an empty editor may be followed by a canonical Project-ID alias.
      if (now - clickedAt >= POST_CLICK_MIN_MS && now - stableSince >= POST_CLICK_STABLE_MS) {
        if (membershipRequired && currentId && firstChatProjectId) {
          if (membershipCheckedId !== currentId) {
            membershipCheckedId = currentId;
            const member = await savedConversationInOriginalProject(page, firstChatProjectId, currentId);
            evidence.folded.originalProjectMembership = member ? "confirmed" : "rejected";
            if (member) {
              // A transient multi-bubble React remount is not evidence of two saved Turns,
              // but it requires independent saved-conversation content/uniqueness proof.
              if (!transientMultipleObserved || await verifyUniqueSavedProjectTurn(page, snapshot.state.url, prompt)) {
                evidence.hydration.savedUniqueTurnVerified = transientMultipleObserved;
                return;
              }
            }
          }
          throw diagnostic("DISPATCH_AMBIGUOUS", snapshot.state);
        }
        return;
      }
    } else {
      stableSince = null;
    }
    // A confirmed User Turn may first render just before the 5s window ends.
    // Allow ONLY that already verified state to complete its 600ms stability dwell.
    // Never extend for an absent/mismatched turn, wrong target or nonempty composer.
    const provedBeforeDeadline = stableSince !== null && stableSince - clickedAt <= POST_CLICK_MAX_MS;
    const waitingForFirstSave = ownedProvisionalUrl !== null && (targetValid || canonicalProjectCandidate
      || (provisionalFirstChat && snapshot.state.url === ownedProvisionalUrl));
    const foldedObservation = !!firstChatProjectId && foldedCandidateObserved
      && turnCount === priorCount + 1 && editorEmpty
      && (targetValid || provisionalFirstChat || canonicalProjectCandidate);
    const canonicalHydrationObservation = canonicalProjectCandidate && priorCount === 0 && editorEmpty;
    // A canonical first-party Project URL is a *reason to observe*, never proof of Send.
    // Hydration can remount 0→2→0→1 while retaining a saved canonical ID.
    evidence.hydration.extendedObservation ||= canonicalHydrationObservation;
    const deadline = waitingForFirstSave || foldedObservation || canonicalHydrationObservation
      ? POST_CLICK_PENDING_SAVE_MAX_MS
      : POST_CLICK_MAX_MS + (provedBeforeDeadline ? POST_CLICK_PROVEN_GRACE_MS : 0);
    if (now - clickedAt >= deadline) throw diagnostic("DISPATCH_AMBIGUOUS", snapshot.state);
    await page.waitForTimeout(200);
  }
}

/**
 * Issue #63: an existing saved Conversation can show 0 or duplicated User wrappers
 * during read-only hydration. Verify the persisted continuation in a separate tab,
 * not the transient count on the Resume tab. Never composes or dispatches a Send.
 */
async function verifySavedContinuationTurn(page: Page, prompt: string, expectedId: string,
  baseline: { bubbles: number; legacy: number }): Promise<boolean> {
  if (baseline.bubbles < 1 && baseline.legacy < 1) return false;
  const original = safeUrl(page);
  if (original.id !== expectedId || !/^https:\/\/chatgpt\.com\/(?:g\/g-p-[A-Za-z0-9_-]{1,120}\/)?c\/[0-9a-f-]{36}$/i.test(original.url)) return false;
  let probe: Page | null = null;
  try {
    probe = await page.context().newPage();
    await probe.goto(original.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const verified = async (): Promise<boolean> => {
      const route = safeUrl(probe!);
      if (route.id !== expectedId || !/^https:\/\/chatgpt\.com\/(?:g\/g-p-[A-Za-z0-9_-]{1,120}\/)?c\/[0-9a-f-]{36}$/i.test(route.url)) return false;
      const bubbles = probe!.locator(USER_BUBBLES);
      const count = await bubbles.count();
      const useBubbles = count > 0;
      const turns = useBubbles ? bubbles : probe!.locator(LEGACY_USER_TURNS);
      const expected = (useBubbles ? baseline.bubbles : baseline.legacy) + 1;
      if (expected < 2 || await turns.count() !== expected) return false;
      let matching = 0;
      let lastMatches = false;
      for (let i = 0; i < expected; i++) {
        const turn = turns.nth(i);
        const root = turn.locator(".whitespace-pre-wrap:not(.whitespace-pre-wrap .whitespace-pre-wrap)");
        const roots = await root.count();
        if (roots > 1) return false;
        const message = roots === 1 ? root.first() : roots === 0 ? turn : null;
        if (!message) return false;
        let shown = await message.innerText({ timeout: 1_000 }).catch(() => null);
        if (i === expected - 1 && typeof shown === "string" && !sameSubmittedText(shown, prompt) && prompt.length > 10_240) {
          const more = turn.getByRole("button", { name: /^(?:Show more|See more|顯示較多|顯示更多|显示更多)$/i });
          if (await more.count().catch(() => 0) === 1) {
            await more.click({ timeout: 1_000 }).catch(() => {});
            shown = await message.innerText({ timeout: 1_000 }).catch(() => null);
          }
        }
        if (typeof shown !== "string") return false;
        if (sameSubmittedText(shown, prompt)) {
          matching++;
          lastMatches = i === expected - 1;
        }
      }
      return matching === 1 && lastMatches;
    };
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (await verified()) {
        await probe.waitForTimeout(600);
        if (await verified()) return true;
      }
      await probe.waitForTimeout(300);
    }
    return false;
  } catch { return false; }
  finally { await probe?.close().catch(() => {}); }
}

export async function reconcileChatGptSend(page: Page, prompt: string, expectedId: string,
  baseline: { bubbles: number; legacy: number },
  onEvidence?: (value: PostClickTurnEvidence) => void): Promise<boolean> {
  // Read-only re-observation of the *original* Send. No composing, click or new dispatch.
  if (safeUrl(page).id !== expectedId) return false;
  try {
    await awaitPostClickSettlement(page, prompt, Date.now(), expectedId, expectedId, baseline, onEvidence);
    return true;
  } catch {
    // A live 0→10 remount can hide the fifth persisted User Turn.
    // Re-read the SAME saved Conversation without sending anything.
    return verifySavedContinuationTurn(page, prompt, expectedId, baseline);
  }
}

export async function sendChatGptPrompt(page: Page, prompt: string, expectedId?: string,
  beforeClick?: (baseline: { bubbles: number; legacy: number }) => Promise<void>): Promise<number> {
  const started = Date.now();
  const initialLocation = safeUrl(page);
  const initialId = initialLocation.id;
  // The original Project is read only from a validated first-party landing URL.
  const firstChatProjectId = /^https:\/\/chatgpt\.com\/g\/(g-p-[A-Za-z0-9_-]{1,120})\/project$/
    .exec(initialLocation.url)?.[1];
  const targetId = expectedId ?? null;
  let latest = await inspect(page, "precompose", started, initialId, targetId);
  // Poll a bounded predicate, never use a blind fixed sleep to guess generation readiness.
  while (!(latest.state.sameTarget && !latest.state.generationActive
    && latest.state.composerMatches === 1 && latest.state.composerVisible && latest.state.composerEditable)) {
    if (Date.now() - started >= 15_000) throw diagnostic("PRE_SEND_NOT_READY", latest.state);
    await page.waitForTimeout(200);
    latest = await inspect(page, "precompose", started, initialId, targetId);
  }
  // A nonempty draft is not ours to overwrite. The previous 15s precompose wait did not resolve #20.
  const draftState = async (editor: Locator): Promise<Readiness["precomposeReason"]> => {
    try {
      const [rendered, raw] = await Promise.all([editor.innerText(), editor.textContent()]);
      return typeof rendered === "string" && typeof raw === "string"
        ? (rendered.trim() || raw.trim() ? "draft_present" : null) : "editor_read_failed";
    } catch { return "editor_read_failed"; }
  };
  const reason = await draftState(latest.composer!);
  if (reason) {
    latest.state.precomposeReason = reason;
    throw diagnostic("PRE_SEND_NOT_READY", latest.state);
  }
  const composer = latest.composer!;
  try {
    await composer.click({ timeout: 3000 });
  } catch {
    const snapshot = (await inspect(page, "precompose", started, initialId, targetId)).state;
    snapshot.precomposeReason = "composer_click_failed";
    throw diagnostic("PRE_SEND_NOT_READY", snapshot);
  }
  // Revalidate after focus: a newly appearing draft or navigation cannot receive our text.
  const focused = await inspect(page, "precompose", started, initialId, targetId);
  const focusedReason = await draftState(composer);
  if (focusedReason || !focused.state.sameTarget || focused.state.generationActive
    || focused.state.composerMatches !== 1 || !focused.state.composerVisible || !focused.state.composerEditable) {
    focused.state.precomposeReason = focusedReason;
    throw diagnostic("PRE_SEND_NOT_READY", focused.state);
  }
  try {
    await page.keyboard.insertText(prompt);
  } catch {
    throw diagnostic("PRE_SEND_NOT_READY", (await inspect(page, "precompose", started, initialId, targetId)).state);
  }

  let state = await inspect(page, "presend", started, initialId, targetId, prompt);
  const deadline = Date.now() + 15_000;
  while (true) {
    if (state.state.sameTarget && !state.state.generationActive
      && state.state.composerMatches === 1 && state.state.composerVisible && state.state.composerEditable
      && state.state.promptPresent && state.state.sendVisibleMatches === 1 && state.state.sendVisible && state.state.sendEnabled
      && state.send) {
      // trial performs Playwright's actionability checks (including hit-target/overlays) without dispatch.
      try {
        await state.send.click({ trial: true, timeout: 800 });
        state.state.sendActionable = true;
        break;
      } catch {
        // A temporarily intercepted/animated target can settle before our bounded deadline.
      }
    }
    if (Date.now() >= deadline) throw diagnostic("PRE_SEND_NOT_READY", state.state);
    await page.waitForTimeout(200);
    state = await inspect(page, "presend", started, initialId, targetId, prompt);
  }

  // Trial actionability can become stale during navigation or another generation.
  const confirmed = await inspect(page, "presend", started, initialId, targetId, prompt);
  if (!(confirmed.state.sameTarget && !confirmed.state.generationActive
    && confirmed.state.composerMatches === 1 && confirmed.state.composerVisible && confirmed.state.composerEditable
    && confirmed.state.promptPresent && confirmed.state.sendVisibleMatches === 1
    && confirmed.state.sendVisible && confirmed.state.sendEnabled && confirmed.send)) {
    throw diagnostic("PRE_SEND_NOT_READY", confirmed.state);
  }
  state = confirmed;
  state.state.sendActionable = true;
  const [beforeBubbles, beforeLegacy] = await Promise.all([
    page.locator(USER_BUBBLES).count().catch(() => -1),
    page.locator(LEGACY_USER_TURNS).count().catch(() => -1),
  ]);
  if (beforeBubbles < 0 || beforeLegacy < 0) throw diagnostic("PRE_SEND_NOT_READY", state.state);
  const beforeUserTurns = { bubbles: beforeBubbles, legacy: beforeLegacy };
  // Persist original ownership proof BEFORE the one possible Send.
  // Any persistence failure happens before click and must not dispatch.
  await beforeClick?.(beforeUserTurns);
  // From this point even a timeout is ambiguous: never retry the actual dispatch.
  try {
    await state.send!.click({ timeout: 8000 });
  } catch {
    const snapshot = (await inspect(page, "click", started, initialId, targetId)).state;
    snapshot.sendActionable = state.state.sendActionable;
    throw diagnostic("DISPATCH_AMBIGUOUS", snapshot);
  }
  try {
    await awaitPostClickSettlement(page, prompt, started, initialId, targetId, beforeUserTurns, undefined, firstChatProjectId);
  } catch (error) {
    if (error instanceof ChatGptSendError) throw error;
    // A post-click DOM/page failure is never safe to reclassify as pre-send or auto-resend.
    throw diagnostic("DISPATCH_AMBIGUOUS", (await inspect(page, "postclick", started, initialId, targetId)).state);
  }
  return started;
}