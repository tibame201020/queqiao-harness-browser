# Issue #51 — ChatGPT Projects UI navigation acceptance (2026-10-29)

## Ownership and regression

**Owner:** Browser Harness ChatGPT Site Adapter, `src/adapters/chatgpt-projects.ts` only.

On the authenticated first-party `https://chatgpt.com/projects` page, the current UI used `main [data-projects-rows] [data-project-row]` while the previous reader relied exclusively on `main [role="row"]`. The previous reader silently returned zero Projects, although the current grid held 20 rows. The modern current row has one empty icon span and one readable name span. Separately, a sidebar localized new-chat button had a pointer interception failure in an existing CEO dispatch. That historical attempt remains conservatively UNKNOWN and must **not** be replayed or unlocked.

## Root-cause fix

1. Read both current `main [data-projects-rows] [data-project-row]` and legacy `main [role="row"]` UI families. A modern row must provide exactly one nonempty name span, otherwise fail explicitly.
2. Require hydrated, stable Projects rows. If no supported UI appears, report `ChatGPT Projects UI not ready or not hydrated` instead of returning a deceptive empty list.
3. For modern Project opening or new-chat preflight, match the exact configured name in the current UI and uniquely match its sidebar row. Read the actual UI `data-app-action-sidebar-project-id`; validate `^g-p-[A-Za-z0-9_-]{1,120}$`; navigate only to `https://chatgpt.com/g/<validated-id>/project`. Reject any origin/path/query/fragment mismatch, challenge, absent, duplicate or noneditable Composer. Never force-click the obstructed sidebar button, bypass security prompts or invent a Project ID.
4. Preserve the legacy grid-opening path and the existing `beforeSend`, conservative Send/Collect and same-Conversation continuation contracts. Failure in this navigation layer occurs *before* Send; typed pre-send error receipts belong to separate Issue #50 and were **not** altered.

## Evidence

- **TDD RED:** 8 of 11 initial new cases failed against unmodified 0.5.6, including the silent empty list, legacy grid dependency, obsolete sidebar click and redirect/composer cases.
- **GREEN:** 14/14 new cases after the fix, including legacy scan, current UI, unique name, missing/invalid IDs, duplicate sidebar and modern grid names, wrong origin/project, unexpected query, absent and noneditable Composer.
- **Full local check:** 35 test files / 240 tests, TypeScript typecheck, compile, package import and stateless Runner acceptance. Production dependency audit returned 0 vulnerabilities.
- **Real authorized Chrome CDP preflight:** a separately authorized read-only browser tab found 20 current Project rows and zero legacy role rows; the configured Project appeared exactly once. The patched candidate reader returned 20 names, exact configured Project once, and navigated to the first-party Project landing Composer (one visible and editable editor), with **zero Sends**.
- **Fresh isolated candidate synthetic Project Trigger/Collect:** newly created test-only Profile sent one synthetic no-tool fixture. Trigger `submitted`, saved Project Conversation ID; Collect `completed`, matching ID and exact synthetic response marker. Independent read-only re-open of the saved Project Conversation verified **1 User / 1 Assistant**, exact full synthetic source and response, empty Composer. Existing failed CEO dispatch was **not** reused.
- All Project names, real IDs, Conversation URLs, cookies, tokens, Chrome profile details and private prompt contents are kept outside the repository. No company or account data is in committed fixtures or docs.

## Rollout gates

- Fresh exact-commit GitHub Actions CI PASS before merge.
- Rebuild and locally install the **new** Extension/Runner on authorized Workers; TypeScript source changes do not upgrade installed `dist/runner.js`.
- Verify installed `list_projects` and landing preflight independently. If publishing npm is blocked by existing registry-account authorization Issue #46, record that as a distinct distribution blocker; do not claim registry acceptance.
- No Paperclip CEO/Board/Employee E2E acceptance is claimed by this issue. That belongs to Paperclip integration.
