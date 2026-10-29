# Issue #44 — nested ChatGPT User content verification (2026-10-29)

## Scope and ownership

**Owner:** Browser Harness ChatGPT Site Adapter post-click verifier. No Gateway/Worker, n8n workflow, CI Runtime, OAuth, Paperclip, login/session, or scheduler modifications.

The initial real field failure, n8n research Execution #37, returned `SEND_OUTCOME_UNKNOWN`, `postClickReason=message_unavailable`, `observedNewTurn=true`, `verifiedNewTurn=false`, and a post-click diagnostic elapsed time of approximately 7.4 seconds. This never established Send loss or provider throttling.

## Evidence-based root cause

A read-only lookup of the original task's n8n Workflow identified its original Browser Harness Profile. That Profile still held the original `ambiguous/unknown` receipt and a saved canonical Conversation ID. No historical Send was retried and the original ambiguity lock was not cleared.

A new **read-only Chrome tab** reopened that exact original Conversation, with the previously authorized CDP browser. After hydration it showed:

- Exactly **1 User Turn** and **1 Assistant Turn**, valid saved Conversation identity and a visible composer.
- The new User bubble contained **two** `.whitespace-pre-wrap` descendants: an **outer DIV** containing the message (1,721 rendered characters), and a **nested SPAN** (2 characters). The nested span is part of the outer message, not a second User Turn.
- The pre-fix source mapped `count > 1` to `message = null`; even with the visible new User Turn it could not read message text, leading to `message_unavailable`. The persistent original DOM shape reproduces this verifier failure path. We cannot reconstruct the precise historical DOM timestamp, so do not infer unrelated timing or rate-limiting causes.

This is an actual Browser Harness selector multiplicity bug. It does not prove the original User prompt matched the displayed message or retroactively change that original `UNKNOWN` receipt.

## Narrow fix

When multiple `.whitespace-pre-wrap` elements exist **within exactly one candidate new User Turn**, inspect only **outermost** candidates with:

`.whitespace-pre-wrap:not(.whitespace-pre-wrap .whitespace-pre-wrap)`

Proceed only if there is **exactly one** outermost message root. A zero-content case still falls back to its original User Turn, and a unique raw match still uses that match. Two sibling roots, failed selectors, unreadable text, mismatched content, noncanonical target, nonempty editor, duplicate new turns or unproven persistence remain `unknown`.

Existing exact/controlled text ownership proof, minimum/stability dwell, single real click, and `submitted/not_sent/unknown` contract are unchanged. No retry, timeout widening, fuzzy equality, additional scheduling, or adjacent-project change.

Privacy-safe diagnostic `turnEvidence.messageInspection` now distinguishes `family`, raw `contentMatches`, `outermostMatches`, categorical `readOutcome`, and provisional-vs-saved first-chat state. It contains no raw prompts, rendered text, DOM, cookies, Profile secrets, Conversation IDs or URLs.

## TDD and authenticated acceptance

- **RED:** targeted nested-content regression failed on previous verifier (`ambiguous/unknown` rather than `submitted`). **GREEN:** the same test passed with unique outermost selection. Sibling-root and wrong-text negative cases still return `unknown` without extra Send. Earlier 4 diagnostic RED→GREEN cases remain covered.
- Full local `npm run check` on updated source: **226/226 tests**, 34 test files, TypeScript typecheck, build, package import and stateless runner checks passed. Versioned release and final CI must still be verified on exact published commit.
- **Original failed Conversation (read-only):** the candidate verifier observed 2 raw matches, 1 unique outermost root, `readOutcome=read`, and returned verified **when the displayed message was supplied as test input**. This proves structural selection and settled ownership logic without any Send. It is **not** proof of equality against the original unpersisted first-chat prompt; the original attempt remains `UNKNOWN`.
- **New original A (pre-fix diagnostic candidate):** authenticated first-chat `triggered/submitted`; `collect/completed` with exact marker; independent readback confirmed 1 User and 1 Assistant, complete prompt, marker and empty composer after hydration.
- **New original B (distinct Markdown/code):** `ambiguous/unknown`, `expanded_text_mismatch` with one readable content root. Read-only readback showed 1 User and 1 Assistant, but rendered content differed from source by 20 characters; it remains locked, was not resent, and is **not** the Issue #44 `message_unavailable` case.
- **New original C (fixed candidate):** authenticated new-chat `triggered/submitted` with saved canonical identity and independent `collect/completed` with exact marker. Separate read-only reopened tab confirmed **1 User + 1 Assistant**, exact full original User prompt, exact Assistant marker and empty composer; no duplicate Send.
- A separate transient pre-click `composer_click_failed/not_sent` occurred during site hydration. This is a distinct pre-dispatch event and is not relabeled as Issue #44.

## Remaining acceptance / rollout

Require fresh exact-HEAD GitHub Actions, production dependency audit, immutable `v0.5.6` release identity, successful npm publish and local installed-extension acceptance before declaring shipped. Use a new original (not an existing `UNKNOWN`) for installed Trigger→Collect if a hosted smoke is needed. Keep all historical unresolved `UNKNOWN` locks; never replay them.

Test-only browser state and original IDs remain in the private local runtime, outside Git. No sensitive data is committed.
