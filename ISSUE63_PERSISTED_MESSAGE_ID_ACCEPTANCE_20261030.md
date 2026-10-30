# Issue #63 — Saved ChatGPT message identity, not conversation round (2026-10-30)

## Product correction

A Browser Harness Send is an **Attempt inside a saved Conversation**, not "the fifth" or "the sixth" Turn. Transient DOM bubble counts do not define persistence. During genuine Browser observations, the visible count stayed 5→5 despite one new persisted User message ID; a separate view also showed 0→10 during React hydration.

On the authenticated ChatGPT Project conversation, the first-party User-message wrapper contained `data-chatgpt-search-message-ids`, one distinct 36-character message UUID per observed persisted User message. This first-party UI identity—not a guessed round index—supports attribution.

## Minimal implementation

- Before the **single** Send click, capture the distinct observed first-party User message IDs and store them in the existing private original `SendAttempt.baseline.messageIds`. Bubble counts are retained for diagnostics and for preexisting legacy attempts, not used as the new persisted-ID confirmation contract.
- For an existing saved Conversation, confirm one *new* persisted message ID absent from that Attempt's original list, with exactly matching complete submitted text. Recheck the **same new UUID** after an independent read-only saved-Conversation observation; do not require `baseline + 1` DOM nodes or any numbered continuation.
- Persist the actual previously observed original first-party Project Conversation URL with the pre-click Attempt. Its saved Conversation UUID must match the Attempt. On a read-only Resume, use this **original observed route**; do not invent a generic `/c/id` route for a Project Turn.
- Keep existing Attempt ID, Conversation ID, Browser binding, one-click dispatch, private full-text source and final source scrub. Unsupported/ambiguous IDs or text cannot be attributed. No automatic resend, invented approvals, additional governance or global Provider redesign.
- Old pre-0.5.13 Attempts without captured message IDs are readable using their existing legacy reconciliation; this release does not retroactively assert that their UNKNOWN status was resolved.

## TDD and observed verification

- Deterministic **RED→GREEN:** saved User message count remains 4→4 but one new first-party persisted message UUID matches original source; positive now succeeds. Negative: previously known message UUID, different original source, foreign origin, two new matching persisted messages, duplicate DOM wrappers with repeated message IDs.
- Deterministic **RED→GREEN:** Resume uses the private observed original canonical Project route, never fabricates `/c/id`.
- Windows `npm run check`: 301/301 unit/regression tests PASS (39 files), TypeScript, build, package import, stateless Runner PASS; production audit 0 vulnerabilities.
- Real Chrome/CDP candidate: single synthetic one-click existing-Conversation Send and Collect completed with exact expected reply. Private Attempt pre-click saved **five unique message IDs**, source was scrubbed and lock released. Independent read-only saved-Conversation readback showed **five displayed messages before and after**, but **one unique new persisted message UUID** matched the original new source, while **four prior IDs survived**. This demonstrates count does not measure Send.
- Real Chrome/CDP candidate read-only Resume against this already saved synthetic content, with the five original message IDs and deliberately incorrect synthetic bubble baseline **999**, returned `submitted` from the original Project canonical URL. **No new Send**.
- The historical native Paperclip CEO sixth-Turn UNKNOWN was not replayed or retroactively marked successful. CEO→Employee Native assignment is a separate real workflow and remains unproven by synthetic Browser tests.

## Distribution

Only claim GitHub merge, CI, release or installed Extension versions after each independent check. Public npm Trusted Publishing remains tracked separately in Issue #46. No private prompts, site UUIDs, credentials, local profiles or account identifiers belong in this repository.
