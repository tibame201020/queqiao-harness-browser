# Browser Harness v0.5.12 — saved fifth-Turn Resume reconciliation (#63)

- Fix v0.5.11 **existing saved Conversation** fifth+ continuation where an original one-click Send may return UNKNOWN after a transient 4→4 render and subsequent read-only Resume sees 0→10 duplicated User bubble nodes.
- For a known original saved Conversation and baseline, when the existing UI Resume scan cannot confirm, independently reopen the same saved UUID **read-only**, wait for baseline + 1 actual saved User turns, and confirm exactly one full original source on the last User Turn across two stable checks.
- Wrong saved target, wrong original text, duplicated saved messages, foreign origin, or persistent DOM ambiguity remain UNKNOWN and non-retryable. **No second Send.**
- No generic governance, approvals, provider abstraction or first-Project Send refactor.
- Deterministic RED→GREEN and negative tests; candidate 297/297 Windows PASS, real same-Project five-Turn synthetic Trigger/Collect, independent saved 5+5 readback and original-Attempt read-only Resume/Collect PASS.
- See `ISSUE63_EXISTING_CONVERSATION_RESUME_ACCEPTANCE_20261030.md`. GitHub Release and local Extensions are distinct from public npm publication (tracked by Issue #46).
