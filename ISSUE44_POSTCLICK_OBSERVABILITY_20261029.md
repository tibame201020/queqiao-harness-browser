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

## New isolated authenticated browser observations (2026-10-29)

A candidate **compiled runner from this PR**, using an isolated private Harness home and the already authorized dedicated CDP browser, ran new original noncommercial synthetic ChatGPT tests. This is **not** a claim that the candidate has been installed as the production Worker Extension.

- Original A: one new-chat Trigger returned `triggered/submitted` with saved canonical conversation identity. Independent `collect` returned `completed` and its exact synthetic marker. Separate read-only Chrome-tab reopening showed exactly **1 User Turn**, **1 Assistant Turn**, one `.whitespace-pre-wrap` content match, readable and exact original User source, and empty composer. An immediate independent assistant read before hydration did not match; a subsequent read-only poll after 4 seconds confirmed the **exact** assistant marker. No second Send occurred.
- Original B: a distinct first-new-chat Markdown/code/table fixture returned `ambiguous/unknown` with `postClickReason=expanded_text_mismatch`; it **did not reproduce** the Issue #44 `message_unavailable` branch. Diagnostic classification: `observedNewTurn=true`, `verifiedNewTurn=false`, `contentMatches=1`, `readOutcome=read`, non-provisional canonical URL and empty composer. Independent read-only reopening confirmed **1 User + 1 Assistant** turn and the expected Assistant marker, but the displayed User text was **20 characters shorter** than the verified input and failed raw and whitespace-normalized equality. The case therefore remains conservatively `UNKNOWN`, retains its private ambiguity lock, and was never replayed.
- One earlier attempt in the isolated environment failed **before** dispatch at `PRE_SEND_NOT_READY/composer_click_failed`. The separate read-only page-load check observed a briefly missing editor before it appeared at around 1.5 seconds. No evidence links this pre-click failure to Issue #44's post-click `message_unavailable` symptom.

These tests demonstrate the new diagnostic build's existing Send/Collect behavior and conservative ambiguity contract. They **do not establish the original field root cause** or close Issue #44. No source prompts, conversation URLs/IDs, cookies or CDP endpoints are published to this repository; the test-only runtime stays outside Git.

## Outstanding acceptance and release boundary

To identify the original `message_unavailable` root cause, obtain a **fresh, authorized, non-replayed** field occurrence running the diagnostic build, preserving `messageInspection`, before/after counts, correct-target boolean, editor settlement and elapsed time. Different `expanded_text_mismatch` or pre-click errors must remain separate.

If selector ambiguity is proven, reproduce that exact DOM shape RED and address it without accepting unrelated text. If `innerText` failure is proven, reproduce transient vs persistent failure and retain fail-closed `unknown` when attribution cannot be proven. Before any behavioral fix or Issue closure: fresh CI and independent original Trigger/Collect readback. Observability-only merge is independent from declaring a field root cause or publishing a bug-fix release.

No changes to Queqiao, n8n, CI Ephemeral Runtime, credentials, OAuth, or scheduling.
