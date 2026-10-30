# Browser Harness v0.5.14 — transient Composer read retry (#66)

- Fix `PRE_SEND_NOT_READY/editor_read_failed` on a one-off `innerText()` or `textContent()` read exception from a verified visible/editable ChatGPT Composer. Within the **existing** readiness window, reacquire the live Composer and retry **read-only**.
- Apply identical read verification before and after Composer focus. A real draft remains `draft_present` and cannot be overwritten. If reads never become valid, report `not_sent`. Exactly one Send when ready; no new governance or policy.
- Issue #66 deterministic RED→GREEN coverage for transient pre-focus and post-focus read failures, transient `textContent()` failures, real draft appearance, and persistent failure. 306/306 Windows tests PASS.
- Real Chrome/CDP candidate: two consecutive synthetic identity → company results in the same saved Project Conversation, each Trigger/Collect completed with exact receipt.
- **#60 regression investigation:** Actual first-Project failed Run observed `0→2` bubbles / `target_unconfirmed` with no saved canonical URL; exact site route was not recorded. Git comparison confirms #63 did not change first Project strict-target conditions. A fresh first-Project synthetic Trigger/Collect completed. No claim that the historical unknown Attempt was resolved, nor proof of a new #63-induced regression.
- Detailed evidence: `ISSUE66_COMPOSER_READ_RETRY_AND_ISSUE60_PROJECT_REGRESSION_20261030.md`. Public npm publishing remains independent Issue #46.
