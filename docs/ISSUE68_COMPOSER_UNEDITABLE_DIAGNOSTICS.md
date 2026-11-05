# Issue #68 — noneditable Composer diagnostics

## Confirmed observations

Installed v0.5.16 original ChatGPT tab returned PRE_SEND_NOT_READY with composerMatches=1, composerVisible=true, composerEditable=false, and precomposeReason=null. This differs from composer_absent and focus-click failure. The present main branch already retries transient focus errors and re-acquires the live Composer within the existing 15s deadline, so no duplicate focus recovery was introduced.

## Minimal implementation

When the precompose deadline expires and exactly one visible Composer is not editable, report precomposeReason=composer_uneditable. This applies both during initial readiness polling and after a failed editor-content read that is followed by a noneditable Composer. The second path was a separately reproduced RED test: it previously returned editor_read_failed despite the terminal DOM state. Save one original-tab viewport screenshot in the existing local private diagnostics area, as already done for composer_absent. Return only the screenshot status and opaque filename, never private image bytes or account content. All failures remain not_sent and do not trigger text insertion or Send.

## Tests and acceptance

- Synthetic precompose test: uneditable Composer gets an explicit diagnosis, no insertion, no Send.
- Synthetic screenshot test: first RED then GREEN for the uneditable state, preserves not_sent.
- Existing wrong Conversation, draft safety, remount, post-click ambiguity and screenshot exclusions remain covered.
- npm check and GitHub Actions are required, plus genuine installed-browser same-Conversation E2E before merge.

## Unknowns

No evidence yet proves whether the failing real ChatGPT page had hydration failure, editor remount, or locator drift. Original-page local image inspection and live browser evidence are needed before adopting an Accessibility Tree / semantic resolver design. No screenshots or user data belong in this repository.

## Verification evidence

The additional draft-read-to-uneditable regression reproduced RED on the original branch (terminal diagnostic incorrectly editor_read_failed), then GREEN after the targeted classification change. The screenshot unit test now also verifies that composer-uneditable PNG bytes remain in the local private directory. Windows verification: 339/339 tests, TypeScript typecheck, build, package import, stateless runner and offline CDP checks passed.

The real authenticated CDP profile and same-Conversation two-turn E2E on the preceding commit validated the normal Send/Collect path, but did not reproduce a noneditable Composer. A new branch commit requires fresh CI and explicit readback before release. No historical UNKNOWN send should be replayed to force a reproduction.

## Merge gate

Do not merge on test results alone. Full CI, genuine authenticated Browser E2E and independent review must be accepted. The original site-side missing Composer root cause remains UNKNOWN; a captured screenshot or a blank-looking viewport does not establish a specific hydration or selector defect.
