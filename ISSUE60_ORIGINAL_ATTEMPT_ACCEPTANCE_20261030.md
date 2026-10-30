# Issue #60 — Original Project first-Send recovery (2026-10-30)

## Root cause

On v0.5.10, the original `runner.ts` `beforeSend` callback skipped every first-new-Project Send with `conversationId=null`. Therefore the runner did not retain the original input and Project identity before its only Send click. When the post-click live DOM remounted (real Issue #59 `0→2→1→2` and Issue #57 `0→2→0→1`), the adapter could report `SEND_OUTCOME_UNKNOWN` even when a canonical saved Conversation later contained one User Turn. Existing `resume` accepted only previously saved Conversation IDs, so a first Project attempt could not reconcile its saved destination.

The real historical Host prompt is not available for a full original-content comparison. Its previous Run outcome is not retroactively rewritten.

## Focused fix (no new governance)

1. Reuse existing private `send-attempt.ts` record and `active.lock` for **first Project new chats**. Before the single Send, record original prompt, baseline, Browser Profile binding and pre-click Project ID, **without inventing a Conversation ID**. After the click, persist only an actually observed canonical saved Project URL.
2. The existing ChatGPT `trigger` path, on ambiguous live DOM, reopens **the same observed saved Conversation read-only**, using existing original first-party Project membership lookup and a stable unique full-matching saved User Turn check. If attributable, it returns the **existing** `triggered/submitted` response, so the ordinary `collect` call can continue. It never clicks Send again.
3. If the first observation is insufficient, the existing Runner `resume` action now handles the persisted first Project Attempt and its observed canonical URL. `resume` uses the same read-only attribution, returns `submitted` upon confirmation, and keeps `pending/unknown` otherwise. The saved original Project membership and full input remain the basis for attribution; transient live bubble counts are not the result.
4. When successfully submitted, the existing attempt record saves the canonical receipt and scrubs private prompt text; it releases the original active lock. Existing saved-conversation Resume remains supported.

No Provider abstraction, Agent policy, Board approvals, extra Host permissions, generic safety engine, or Paperclip governance changes.

## Scope tests

- Private attempt tests: new Project `conversationId=null`, original Project and prompt persisted, observed canonical ID added *after* click, no guessed/provisional target or second attempt, verified source scrub after submitted.
- Adapter tests: after one mocked Send with `DISPATCH_AMBIGUOUS`, read-only reconciliation returns original `triggered/submitted`, or maintains `ambiguous/unknown` on mismatch. `beforeSend` runs exactly once.
- Read-only adapter Resume tests: stable saved unique full text in original Project, delayed saved hydration `0→0→2→1`, negative two real saved messages, wrong message, wrong membership/Project, redirect, invalid provisional URL. None sends any input.
- Windows initial suite **289/289 PASS**, 37 files, `npm run check` typecheck/build/package import/stateless runner PASS, production npm audit zero vulnerabilities.
- Compiled candidate **0.5.11** newly initialized synthetic Project first Send **7,100 characters** returned `triggered/submitted` and canonical URL. Private Attempt readback (sanitized booleans only) confirmed: original Project saved before Send, initial Conversation null, observed canonical persisted, status submitted, prompt scrubbed, active lock released, pending pointer cleared.
- Remaining acceptance: exact merged-main GitHub Actions; Windows/WSL local install; **installed Extension** Trigger → Collect → independent saved Conversation readback, with exact original Project membership. Do not claim historical Paperclip CEO success from synthetic evidence.

## Next owning integration

Return to SOF CEO Native E2E after this Browser Harness feature is installed and independently verified. The actual Paperclip Host supplies an authorized new Run; this adapter fix does not create synthetic governance tasks or replay prior real Run.
