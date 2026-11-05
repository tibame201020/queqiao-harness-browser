# Issue #68 — Browser Accessibility tools: comparison and bounded integration

## Scope and verified tooling (2026-11-05)

This is a **Browser** experiment inspired by the OS Accessibility approach in `agent-desktop`, not an attempt to implement a new accessibility subsystem.

| Existing tool | Verified behavior | Integration decision |
| --- | --- | --- |
| Playwright 1.63.0 | `getByRole("textbox")` re-resolves after DOM identity replacement; `ariaSnapshotJSON({mode:"ai"})` yields native accessibility refs | **In-process runtime fallback**, no extra dependency |
| Vercel Labs `agent-browser@0.41.2` | `--cdp` attached to an isolated Chrome; Snapshot returned semantic textbox/button and ref; fresh ref click executed exactly once | Viable alternate/QA baseline, **not** introduced as second production browser owner |
| Chrome CDP `Accessibility.getFullAXTree` | Native synthetic page produced a textbox role | Low-level diagnostic option, not a new resolver |

Reference implementations: https://github.com/vercel-labs/agent-browser , https://github.com/vercel-labs/agent-desktop , https://playwright.dev/docs/aria-snapshots , https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/ .

## Production boundary

`resolveChatGptComposer()` preserves existing CSS as primary. Native Playwright `getByRole("textbox")` is considered **only when CSS matches zero elements**. It requires exactly one visible accessible textbox, actual `HTMLElement.isContentEditable === true`, one ancestor form and exactly one known Send control inside that form. A duplicate CSS result stays ambiguous. No arbitrary nearest-element or coordinate clicks. A semantic candidate does **not** override the existing exact-draft checks, same-Conversation binding, pre-Send trial click, post-click ambiguity or no-resend rules.

The read-only `composerResolution` diagnostic is restricted to `css | aria | ambiguous | none`, never page text or accessibility snapshots. Real browser Ref values are intentionally not persisted: references are ephemeral, should be refreshed after DOM changes, and the normal in-process Playwright Locator re-resolves automatically.

## Test evidence

- Resolver TDD: missing module RED, then 9/9 GREEN including CSS precedence, selector drift, duplicate/hidden/noneditable/missing/unbound candidates.
- Isolated real Chrome comparison (no user account): `node scripts/issue68-semantic-poc.mjs` after building. Existing CSS missed the remounted element; integrated native ARIA fallback recovered it. Agent-browser Snapshot/Ref click succeeded; absent, duplicate and native noneditable cases all failed closed.
- A concrete caveat was reproduced: Playwright `locator.isEditable()` returned `true` for a synthetic role=textbox node whose DOM `isContentEditable` was `false`. The runtime fallback therefore separately gates on `isContentEditable`.
- The optional Chrome PoC executes `npx agent-browser@0.41.2` on Windows and is **not** a CI prerequisite because external package resolution and an installed headed Chrome are not guaranteed on GitHub Actions runners. Unit tests run through the existing `npm run check` CI workflow.
- A read-only probe of the historical CDP endpoint returned zero currently open saved-Conversation tabs. This gives **no authentic-site evidence** for semantic fallback on the original failing page.

## Acceptance boundaries

The synthetic DOM replacement test proves handling of selector/element identity drift. It does **not** establish that the original ChatGPT `composer_absent` / `composer_uneditable` issue was caused by selector drift. Site hydration, authentication challenges, a genuinely missing Composer, and unstable navigation remain distinct failure classes. Do not claim root-cause remediation until real failed-page evidence and independent review support it. Do not commit account data, actual accessibility snapshots, private screenshots, or Conversation IDs.

**Merge gate:** current-head CI, authenticated branch E2E, independent review, and disposition of original #68 failure. Keep PR #77 Draft until met.
