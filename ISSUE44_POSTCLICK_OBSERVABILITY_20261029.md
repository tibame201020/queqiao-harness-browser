# Issue #44 — ChatGPT first-send post-click observability (2026-10-29)

## Scope and status

Browser Harness ChatGPT Site Adapter only: `src/adapters/chatgpt-send.ts` and its synthetic regression tests.
This change is **diagnostics only**. It does **not** establish the field root cause, change Send classification, extend wait windows, auto-retry, or establish Hosted E2E acceptance.

Field report: first new-chat Send returned `SEND_OUTCOME_UNKNOWN`, `observedNewTurn=true`, `verifiedNewTurn=false`, `postClickReason=message_unavailable`. The prior aggregated receipt did not identify the content selector match count or the text getter outcome.

## Added non-content evidence

When exactly one new candidate User Turn is observed in the accepted target/provisional first-chat path, `turnEvidence.messageInspection` reports:

| Field | Allowed values | Meaning |
| --- | --- | --- |
| `family` | `bubble`, `legacy` | Which User Turn selector family was used |
| `contentMatches` | `-1`, `0`, `1`, `>1` | Number of `.whitespace-pre-wrap` candidates; `-1` means selector count failed |
| `readOutcome` | `read`, `read_failed`, `ambiguous_content`, `selector_failed` | Readable string, text getter failure, multiple matching descendants, or selector failure |
| `provisionalFirstChat` | boolean | Whether a first-chat local ID was being observed (not a saved canonical conversation) |

These fields do not include prompt text, rendered text, DOM, cookies, profile details, or conversation identifiers. They are current-sample observations and not sufficient on their own to prove attribution. Existing conservative Send semantics remain authoritative: one owned click, prompt ownership, canonical target, settled composer, and a uniquely attributable User Turn. An unproven Send remains `unknown` without auto-resend.

## TDD and safe next evidence

The new synthetic tests initially failed 4/4 (RED) because `messageInspection` was absent; the diagnostics-only implementation then passed those same 4/4 (GREEN). The tests cover multiple content matches, failure to read the single content, failure to read the fallback turn, and failure to count content candidates. They assert one real Send attempt, `unknown`, non-retryability, and no prompt leak.

Next, on a **new separately authorized first-chat Trigger** with this build installed, capture only the categorical `messageInspection`, candidate before/after counts, composer settlement, canonical ownership boolean, and bounded elapsed time. Correlate the receipt with independent Collect. If the target is not saved or attribution remains unproven, retain `UNKNOWN`; do not repeat the Send. Use this evidence to identify the actual root cause before proposing a behavior change.

No changes to Queqiao, n8n, CI Ephemeral Runtime, credentials, OAuth, or scheduling.
