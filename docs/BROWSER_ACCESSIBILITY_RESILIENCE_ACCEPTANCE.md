# Browser Accessibility Resilience — PR #77 acceptance

## Objective and boundary

This branch improves **Browser Harness interaction stability and reliability** using existing Playwright/Chrome Accessibility APIs. Investigation or remediation of the historical ChatGPT Composer incident is **not** the acceptance criterion.

Playwright 1.63 native `getByRole` is the runtime implementation; Vercel Labs `agent-browser@0.41.2` and CDP Accessibility API were compared using isolated Chrome. Do not add a second Browser runtime owner, duplicate CDP lifecycle, or write a custom Accessibility tree engine.

## Shared resolver

`src/core/semantic-editor.ts` owns provider-agnostic resolution. Each Adapter supplies its own CSS, allowed Accessibility roles and known Submit selector **inside the same form**. The CSS route remains primary. Native semantic fallback occurs only on **zero** CSS matches. Multiple CSS or semantic candidates fail closed. Fallback requires visible DOM `isContentEditable`, exactly one ancestor form and exactly one provider-scoped Send control.

The shared resolver distinguishes **pre-dispatch** from **post-dispatch** use. Send ownership is mandatory to authorize filling/submission; ChatGPT post-click inspection is observation-only because Send may legitimately become Stop during generation. It still requires a unique visible native-editable textbox in its form and can never authorize a new Send. A real Chrome lifecycle fixture covers this transition.

The shared API returns the **strict live Accessibility Locator**, never `.first()`: an editor that was unique at resolution can gain a second matching textbox during a DOM remount. In that case, Playwright strict mode must reject the subsequent fill rather than retargeting to the first editor. The isolated Chrome race test verifies that both original and newly inserted drafts remain unchanged. This addresses a reproduced P1 finding from an independent Codex review.

The shared API treats CSS-count exceptions as failures, **not** as zero matches. A failed read cannot authorize a semantic fallback. The form-owned Send check is repeated by Playwright when a fresh locator is resolved, and duplicate controls never get a first-match click.

The shared API is integrated by:
- ChatGPT: existing `chatgpt-composer-resolver.ts` facade; existing exact-text, target identity, postclick ambiguity and no-resend constraints unchanged.
- Grok: native `combobox|textbox` role, provider-owned `chat-submit` in form.
- Mistral: native `textbox` role, provider-owned form `Send`.
- Claude: **CSS-only** until authenticated UI evidence confirms the form/Send relationship; do not infer a generic contract.

WebChat fallback uses the validated **form-owned** Send locator instead of a global first-match Send locator. A second pre-click count check after the editor has been filled rejects a newly duplicated or missing Send control as `SEND_CONTROL_MISSING` before dispatch. This reduces a real DOM-remount ambiguity without modifying the post-click no-resend boundary. The existing provider-specific login gate, site challenge, target URL checks and postclick ambiguity behavior still own decisions.

## Reproducible tests

- `npm run check`: includes `src/core/semantic-editor.test.ts`, `src/adapters/web-chat-accessibility.test.ts` and existing ChatGPT/provider regression suites. Those tests run in the existing GitHub Actions workflow.
- `node scripts/issue68-semantic-poc.mjs`: optional Windows Chrome/agent-browser comparison for ChatGPT-like fixture.
- `node scripts/semantic-editor-browser-poc.mjs`: optional native real Chrome fixture for Grok/Mistral-like form-owned roles. Requires installed Chrome and the project build; no provider account or user data.
- Authenticated Browser Harness synthetic conversation must be verified against each **new PR head** before completion claims, with no replay of UNKNOWN Send attempts.

## Required acceptance

A. CSS precedence, AX fallback after DOM replacement and missing/noneditable/duplicate elements.
B. A recovered editor binds to its provider-scoped Submit; one synthetic Send maximum.
C. Cross-provider smoke and current-head CI.
D. Independent review of accessibility ambiguity, cross-provider assumptions and send safety.
E. Documentation includes unsupported cases; no private data, login state, transcript or screenshots committed.

Limitations: Accessibility cannot create UI not rendered or resolve login/session/site-challenge, navigation failure or absent elements. Synthetic fixture PASS does not prove actual provider markup is unchanged. No structural change is made to CDP lifecycle or Provider authentication.
