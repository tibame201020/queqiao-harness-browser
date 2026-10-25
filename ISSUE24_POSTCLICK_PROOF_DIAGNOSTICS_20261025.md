# Issue #24 — generic ChatGPT post-click proof instrumentation (2026-10-25)

## Status
**Not yet a fix for WEB-35.** Original WEB-35 is intentionally unreplayed, and the test-only Head's Paperclip Native Skill/Done E2E has not passed. This candidate only makes future independent ambiguous receipts diagnostically actionable, while preserving existing dispatch semantics.

## Grounded evidence from v0.5.5-rc.0

- Installed source: merged main `be08ccf517707584cb19925e99001579ba1e1a5a`. WEB-35's first original dispatch returned `DISPATCH_AMBIGUOUS`, 6388ms since trigger start, `submissionConfirmed=false`, `composerSettled=true`, `ambiguousTrigger=true`. Original durable Host receipt remains dispatching with one attempt.
- Current read-only inspection of the exact original WEB-35 conversation in its preserved isolated profile: one user bubble, one assistant message, empty composer; one `.whitespace-pre-wrap` content node; the localized Show more/顯示較多 role selector returns exactly one control. Before expanding, `innerText` length 10,230 and `textContent` length 10,228. After the UI-only expansion, the lengths are 12,538 and 12,536. The two text extraction methods are equal after whitespace normalization. No message/DOM text, user identity, URL, cookies or credential entered the repo.
- Existing terminal `sameTarget=false` is **not an explanation by itself**: the old `sameTarget` helper compares against the original null ID for new chats and can therefore be false after successful navigation. The actual post-click `targetValid` is checked separately.
- A different, fresh, original **12,457-character synthetic assembled-style prompt**, executed on genuine authenticated ChatGPT by installed `0.5.5-rc.0` Site Adapter, returned `triggered`. Nonsecret DOM sampling: new full matching user bubble around 1,077ms; folded 10,240-character bubble and assistant node around 1,409ms; stable conversation ID around 3,480ms; expansion click around 3,660ms; full matching 12,457-character bubble around 3,715ms; success around 4,681ms. One Send; no original Paperclip dispatch was replayed. This proves the generic long scenario can succeed, **not** that WEB-35 is fixed.

## Why the original WEB-35 remains unproven
WEB-35's original `p.context.prompt` was transient in the Host; the durable Host receipt does not retain its full text or expected length, correctly avoiding private prompt storage. Independent readback confirms the expanded rendered message exists but cannot reconstruct the *original expected string*, nor the exact post-click observation sequence. The source also currently records only two post-click booleans, obscuring whether target navigation, new-turn count, display text, prefix condition, expansion click or final text equality failed.

## Minimal candidate (observability only)
- Extend fixed-schema readiness with `postClickReason` enum, set only from observed post-click UI predicates. Categories: target unconfirmed, new turn absent, message unavailable, folded prefix mismatch, expansion control missing, expansion click failed, expanded text mismatch, full-text mismatch, composer not settled, stabilizing.
- No relaxation of full semantic equality; exactly one Send; no automatic retry or draft clearing; same conversation identity, 3–5 second bound and cancellation safety unchanged.
- Test-first: two distinct negative scenarios are **RED** under original code, then GREEN with the new diagnostic; still `DISPATCH_AMBIGUOUS` / `retryable=false`. The test does not include raw user content in receipts.
- After code change: `npm run check` 159/159 across 31 files; TypeScript/build/package import PASS; production npm audit 0 vulnerabilities; diff check clean.

## Unfulfilled acceptance gate
A **new**, independently authorized Paperclip test-only Head Run (not WEB-33/34/35 retry) is still required to observe the `postClickReason` category for a true full assembled prompt, then test an evidence-based minimal behavior correction through new/resumed installed Runner and genuine Native Skill/Done. Preserve all old profiles and receipts. No Merge, Tag, Release, npm Publish or Worker Local Install is claimed for this diagnostic candidate.
