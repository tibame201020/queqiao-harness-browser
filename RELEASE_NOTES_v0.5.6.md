# Browser Harness v0.5.6 — Release Notes

Scope: ChatGPT first-new-chat post-click content selector correctness; no adapter or upstream workflow redesign.

## Root cause and fix

- Original observed User Turn had two **nested** `.whitespace-pre-wrap` nodes. The old verifier interpreted multiple descendant matches as an unreadable message and returned `message_unavailable`.
- Select the **unique outermost** User bubble content root when nested whitespace-preserving elements exist. Two sibling roots, unreadable or mismatched text and foreign targets continue to fail closed as `unknown`.
- Add privacy-safe counts for raw/outermost content matches and categorical read outcomes. Preserve exact prompt correlation, saved Conversation ID, empty composer, bounded settling and one-click/no-auto-resend semantics.
- No changes to Queqiao-n8n pacing, Queqiao Gateway, CI Runtime, OAuth, Paperclip or provider scheduling.

## Verification

- Nested-content TDD: RED before fix, GREEN after; wrong-content/sibling-root negative cases remain `unknown`.
- Full Harness suite: 226 unit tests, typecheck, build, package import, stateless runner.
- Real authenticated Browser Harness candidate: read-only original nested DOM structural verification; new independent synthetic Trigger→Collect and read-only complete User/Assistant receipt.
- Exact release CI and published package acceptance are separately required.

## Release contract

GitHub Tag `v0.5.6`, `package.json.version=0.5.6`, Queqiao manifest `version=0.5.6`, and npm package version must agree. Publishing uses existing GitHub Release → Actions workflow with provenance. No user prompt, Conversation ID, cookie, token, profile secret or private URL is committed.
