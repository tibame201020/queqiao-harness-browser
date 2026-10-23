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