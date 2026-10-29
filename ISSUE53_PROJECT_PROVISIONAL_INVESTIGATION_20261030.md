# Issue #53 — First Project Send attribution / acceptance (2026-10-30)

## Product ownership and historical UNKNOWN
**Browser Harness ChatGPT Site Adapter** owns post-click Project correlation, canonical URL receipts and safe read-only membership proof. Paperclip governance, n8n and Queqiao infrastructure are out of scope.

The original SOF CEO Run reported provisional `local-chatgpt` and **0→2 bubble candidates**, with no verified canonical Conversation. Its original browser tab was unavailable for subsequent DOM inspection. The two candidates might be distinct turns or duplicate renderer nodes; **do not reinterpret, replay or declare that historical Run successful**. This historical ambiguity remains unresolved.

## Discriminating reproduction

1. Installed **0.5.7** on authenticated Chrome/CDP sent a fresh 8,628-character synthetic Project prompt. URL transitioned provisional → canonical, one User bubble, Send completed. A provisional URL is **normal site behavior** and not proof of a failure alone.
2. Controlled RED fixture against original 0.5.7: Project-scoped provisional + exactly one owned User Turn + empty editor + canonical save after ~6.8s returned `DISPATCH_AMBIGUOUS / target_unconfirmed` at 5s. General-chat equivalent was already supported.
3. Independently observed a *different* live false negative: pre-click validated Project landing ID differed from provisional **and** canonical Project route IDs in the **same original Browser tab**; despite one matching User turn and canonical saved Conversation, the initial candidate returned UNKNOWN. A separate **read-only** inspection of the original Project landing list found that exact canonical Conversation ID among the original Project's conversations. A saved page also contained the exact synthetic User/Assistant responses. This proves an additional **Browser Harness over-strict route-ID attribution**; it does not prove the original two-bubble SOF attempt's fate.

## Code contract / safety

- Only first-Send Project paths `/g/g-p-<UI-ID>/c/local-chatgpt%3A<uuid>` may enter a **bounded observation extension**, after exactly one newly observed User Turn whose *entire* content matches the intended prompt and a settled empty editor. A provisional UUID is **never** a saved Conversation ID.
- When the canonical Project route ID differs from the validated pre-click Project ID, a distinct read-only tab navigates to the **original** first-party Project landing page and confirms exactly one first-party Project conversation link whose UUID matches the canonical saved Conversation. Close that tab after verification. Any mismatch, missing link, page error, or wrong origin remains `DISPATCH_AMBIGUOUS`; **never auto retry**.
- The original message's unique User Turn, full source equality and empty editor remain required. Two distinct bubble candidates, wrong prompt, wrong Project membership, missing canonical URL or draft all retain UNKNOWN.
- Successful Trigger returns the site's **actual canonical saved Project URL** (not a synthetic URL built with the pre-click Project ID); Collect must use the same ID/URL.
- Other providers, existing Conversation/Resume and general new-chat behavior remain unchanged. No private project names/IDs, accounts, secrets, message content, CDP endpoints, or browser profiles are committed.

## TDD and actual E2E evidence

- RED before correction: one delayed Project-save test on old 0.5.7; one canonical alias + membership case and six canonical receipt URL tests on original candidate.
- GREEN after correction: delayed save; safe alias + first-party membership; missing/wrong membership, mismatched source, two turns, nonempty editor, foreign origin/route/UUID and original safety cases.
- Windows `npm run check`: **259/259 tests PASS** across 35 test files; TypeScript, build, package import, stateless runner all PASS; production `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilities**.
- **New, isolated compiled candidate 0.5.8 synthetic Project first-Send:** `triggered/submitted` with canonical Project Conversation ID; `collect/completed` for the same ID with exact expected response marker.
- **Independent read-only saved Conversation readback:** the saved ID is listed exactly once on the originally selected Project landing page; canonical saved route equals Trigger/Collect receipt; exactly **1 User + 1 Assistant**; full original synthetic prompt and exact response marker; Composer empty.
- Existing historical SOF CEO Run was not retriggered; no Paperclip strategy/approval/employee E2E acceptance is claimed by this Browser Harness verification.

## Publication gates
Require exact-commit GitHub Actions PASS, reviewed PR merge, freshly built and installed Windows/WSL Extension, installed-Extension synthetic Project Trigger/Collect + independent readback, and public release status verified separately. npm Trusted Publishing permissions remain Issue #46. If any new verification fails, leave the release blocked; do not turn UNKNOWN into success.
