# Browser Harness v0.5.17 — save original missing-Composer screenshot (#68)

- For `PRE_SEND_NOT_READY / composer_absent` only, capture one viewport PNG **from the original Run-owned page before it closes**.
- Save bytes in the private local Harness profile's `private-diagnostics/` directory. Response/State includes only the randomized filename and `saved` or `capture_failed` status, never screenshot bytes or a private absolute path.
- Screenshot exceptions cannot change `not_sent` to a different result. No extra Send, focus, navigation, wait, retry, approval or governance behavior.
- TDD tests validate persistence, non-trigger cases, and failure handling. Details: `ISSUE68_ORIGINAL_TAB_SCREENSHOT_ACCEPTANCE_20261031.md`.
- This improves *future* failure evidence. Historical UI pages that were already closed cannot be recovered retroactively. Issue #68 remains OPEN.
