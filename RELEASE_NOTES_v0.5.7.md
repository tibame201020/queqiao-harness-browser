# Browser Harness v0.5.7 — Release Notes

## ChatGPT Projects UI navigation (#51)

- Update `list_projects` for current first-party `[data-projects-rows] [data-project-row]` while keeping legacy `[role="row"]` support. Explicitly fail if Projects UI is not hydrated or row identity is ambiguous.
- Avoid the obstructed sidebar new-chat button: uniquely match the configured Project name in the authenticated UI, extract and validate the visible sidebar Project ID, navigate to its first-party Project landing route and verify a uniquely visible/editable Composer before Send.
- Reject unsafe or ambiguous identity, invalid ID, foreign origin, unexpected redirect/query and absent Composer without submitting a message.
- Do not weaken conservative post-click UNKNOWN, retry protection, beforeSend, Collect or same-Conversation behavior. Related Issue #50 typed pre-send error handling remains separate.

## Verification

- 14 new TDD cases; full 240 unit tests, compile and package/runner checks PASS; production dependency audit 0 vulnerabilities.
- Real authorized CDP Projects-page scan, landing Composer readiness, and fresh isolated synthetic Project Trigger/Collect plus independent exact readback PASS.
- No user account information, private Project identifiers, Conversation URLs or credentials committed.

## Release identity

Tag `v0.5.7`, package `0.5.7`, manifest `0.5.7`, and npm version must match if public distribution is attempted. npm Trusted Publishing authorization remains tracked separately in Issue #46; GitHub Release or local install alone is **not** npm registry acceptance.
