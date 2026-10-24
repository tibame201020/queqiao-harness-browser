# Issue #20 / PR #21 — ChatGPT post-click settlement candidate (2026-10-23)

Scope: generic ChatGPT Site Adapter only. No Paperclip-specific path, Browser Harness global lifecycle change, user credentials, or production company mutation. Historical 0.5.4-rc.0 precompose-wait attempt is superseded.

## Root-cause evidence
- In WEB-32 the previous follow-up remained in the composer and also appeared in the conversation DOM after a verified previous turn. The old 15-second precompose draft-clearing wait did not fix the actual Live problem.
- The ChatGPT send routine treated a successful Send click as dispatch completion. The resumed conversation URL cannot demonstrate a new User Turn, and the global lifecycle closes the managed Browser Session immediately after execute.
- The precise server-side persistence mechanism remains unproven; this candidate verifies observable Site UI settlement, not remote database durability.

## Corrected scoped contract
- Preserve pre-send no-overwrite, #18 semantic multiline integrity, form-associated Send, Playwright trial actionability and a single real click. Remove the ineffective 15-second draft-present precompose wait; keep bounded fixed-schema precompose classification.
- Snapshot User Turn count before the real click. After click, retain the same Browser Session and confirm one new User Turn with semantically matching full content, the expected conversation identity, and an empty composer. Require stable observation and minimum 3-second dwell within maximum 5-second deadline.
- Possible-click with unverified/mismatched User Turn or uncleared composer is DISPATCH_AMBIGUOUS and retryable=false; never change to PRE_SEND_NOT_READY, clear the editor, or replay an original dispatch. Diagnostics expose only fixed-schema booleans and counts, never original prompt, DOM, cookies or credentials.

## Verification evidence
- TDD RED: five new targeted cases on prior implementation misclassified missing or partial post-click submission as triggered; baseline was 146 tests.
- TDD GREEN: npm run check 151/151 across 31 files, TypeScript/build/package import pass; production npm audit reports zero vulnerabilities.
- Isolated real Chrome using built/staged production Site Adapter and a local synthetic chatgpt.com route; no external provider request:
  * Delayed new matching User Turn plus naturally cleared composer: one click; completed only after approximately 3.28 seconds.
  * Click accepted without new User Turn: one click; DISPATCH_AMBIGUOUS after approximately 5.21 seconds.
  * New matching User Turn with retained composer: one click; DISPATCH_AMBIGUOUS after approximately 5.18 seconds.
- The synthetic Chrome test validates actual Playwright/contenteditable/control flow; it is NOT an authenticated ChatGPT website or Host multi-turn E2E pass.
- No Paperclip test issue, Run, recovery or credential was created or replayed.

## Merge gate
PR #21 stays Draft until the candidate has separate authenticated generic ChatGPT same-conversation send/collect acceptance and existing CI is green. A Paperclip 11-part workflow, its authorization and recovery remain independent product-boundary tests. No merge, tag, npm release or Worker upgrade is claimed from this source/synthetic evidence alone.
## Follow-up, 2026-10-24: current website DOM and dependency review
- Fresh local production audit surfaced GHSA-mrhx-c7xc-m3w5 in pinned zod 4.4.3. Updated only its exact dependency and lockfile to zod 4.6.7; re-run full tests and production audit before merge.
- One new isolated generic authenticated-site synthetic Send was attempted exactly once with the prior staged candidate. It returned ambiguous/postclick (composer settled=true, submitted User Turn=false) because current ChatGPT no longer exposes the legacy author-role selector; its URL was never reused for a second Send. A subsequent independent read-only re-open of that exact new conversation proved one current-site user bubble carrying the semantically exact 362-character synthetic prompt and one distinct assistant response carrying the expected exact marker. Neither the URL nor raw content/DOM is stored in this repo.
- Current ChatGPT identifies user turns by data-user-message-bubble=true and assistant content by data-markdown-text-style=assistant-message. A new pair of TDD tests for new-chat and resumed conversations failed on the old selector (2 RED), then passed with disjoint primary user-bubble and legacy author-role counting. This is a Site Adapter DOM compatibility fix, not Paperclip logic.
- Do not repeat the ambiguous original send. An explicitly reconciled original receipt or separate fresh test profile is required before any further new test dispatch. No merge/release/installed Worker version claim until final real same-conversation Trigger/Collect plus fresh main/PR CI.

## Final authenticated generic Harness acceptance — 2026-10-24
- Candidate Site Adapter source with the current User Turn bubble fallback was tested before the final version-only promotion. Two new TDD cases (new chat and resumed chat) were RED on legacy-only selector and GREEN on the updated implementation.
- The first isolated A1 Send returned a safe ambiguous result because ChatGPT's current user bubble uses data-user-message-bubble=true instead of the former data-message-author-role=user. Reopening the exact original new conversation **read-only** proved the single source prompt was fully submitted (semantic comparison), and the independent assistant response was the exact expected marker. A1 was never replayed. The existing explicit ambiguity acknowledgement was then used only to authorize a DIFFERENT synthetic prompt A2.
- A2: new original authenticated ChatGPT Runner trigger returned triggered with a new conversation ID; an independent Runner collect returned completed, the exact A2 marker and the same conversation ID. Only one A2 Send occurred.
- A dedicated local-only and manual acceptance Profile alias (reusing the existing user-approved managed Chrome user-data directory, stored entirely outside the repository) was then configured to resume that exact A2 conversation without modifying the original config. A3 used another new synthetic multiline prompt: Runner trigger returned triggered with the SAME conversation ID; Runner collect returned completed and the exact A3 marker.
- Fresh independent read-only Chrome launch on that original A2/A3 URL verified exactly TWO user bubbles and TWO assistant messages, semantically exact A3 prompt, exact independent A3 assistant marker, an empty composer and unchanged conversation ID. No Paperclip Issue, Run, recovery or production company was created/mutated. Private URLs, browser profile data and detailed receipts remained outside the repository.
- Current ChatGPT DOM changed independently from the original #20 defect; the generic Site Adapter now prefers data-user-message-bubble=true and falls back to data-message-author-role=user, counting just one family so nested wrapper attributes cannot double count turns. Assistant Collect's existing data-markdown-text-style=assistant-message fallback worked on the live site.
- A new npm audit detected high-severity advisory GHSA-mrhx-c7xc-m3w5 against pinned Zod 4.4.3; changed the exact direct dependency/lockfile to patched Zod 4.6.7. The accepted source candidate was version-only promoted from 0.5.4-rc.0 to 0.5.4 for merge. Run full npm ci, check, audit and CI against the final commit before completing the merge.
- These results certify the generic Browser Harness site boundary only. Paperclip's 11-part Skill/Done and Recovery flows are independent acceptance gates. GitHub release, npm publish and installed Worker upgrades are not implied by merging the source PR.
