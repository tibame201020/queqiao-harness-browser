# Browser Harness v0.5.13 — original persisted message identity (#63)

- For existing ChatGPT Conversations, attribute an original Send by the **new persisted first-party User message UUID** and exact original input, not by an arbitrary numbered round or DOM `baseline + 1` requirement.
- Preserve the original saved Project Conversation URL in the existing private Attempt before the only click; Resume revisits the observed canonical route and performs independent read-only confirmation.
- Existing private Attempt identity and one-click dispatch stay unchanged. Legacy UNKNOWN Attempts are not replayed; no new policy/approval/provider layer.
- TDD RED→GREEN for count-preserving saves, old-message-ID false positives, duplicate DOM IDs, wrong source/target, original saved-route Resume; 301/301 Windows tests PASS.
- Authentic Chrome/CDP synthetic Send + Collect and independent saved message ID readback PASS even with visible 5→5; separate original Attempt Resume passes with synthetic wrong baseline of 999.
- See `ISSUE63_PERSISTED_MESSAGE_ID_ACCEPTANCE_20261030.md`. GitHub Release/local Extension install is independent of public npm Trusted Publishing (Issue #46).
