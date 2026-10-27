# Issue #30 — resumed Send post-click count-only diagnostics

**Purpose:** gather evidence before a root-cause repair. Existing `SEND_OUTCOME_UNKNOWN` behavior remains fail-closed. This branch does not change the timeout, Send ownership, target validation, content matching, or retry policy.

## Verified original failure (2026-10-27)

- New isolated test-company Paperclip Parent WEB-63 delegated a single WEB-64 Head Child. The Head completed; Paperclip auto-woke the CEO with `issue_children_completed`.
- The first resumed Send in CEO wake Run `f4fc02a4-f005-4ea2-b296-e88b23cb58b3` stopped as `SEND_OUTCOME_UNKNOWN / new_turn_absent`.
- Candidate diagnostic evidence at original failure: `elapsedMs=6928`, same saved Conversation, settled editor, before `(bubbles=4,legacy=0)`, current/min/max `(4,0)`, **20 Post-click checks**, no new User Turn observed, no content verification passed, one owned Send.
- **Later independent read-only reopen of the exact saved Conversation** found **5 User / 5 Assistant** turns. The newly present User turn included the unique synthetic wake marker `RESUME_DIAG_HEAD_13_20261027` and the Paperclip wake context; its Assistant asked for the native identity operation.
- The exact arrival timestamp and byte-for-byte equivalence to the original source text were not logged. Evidence supports **late User Turn appearance after the initial observation**; it does not establish whether frontend, network, or backend caused the latency. Do not replay or relabel any failed original Run.

## Instrumentation only

- `src/adapters/chatgpt-send.ts`: adds `turnEvidence` with before/current/min/max bubble and legacy selector counts, observation count, observed/verified new-turn flags, and at most eight bounded boolean/count samples (two earliest and six most recent).
- `src/adapters/chatgpt-trigger.test.ts`: synthetic RED then GREEN test for a resumed click with zero new turns. Asserts one Send, correct counts, bounded samples and **no raw prompt** in diagnostics.
- No raw user messages, DOM text, cookies, private URLs, authorization headers, payloads, or browser traces are added to the new field.
- Post-click deadline, content proof, strict positive acknowledgement, and no-auto-resend rules are unchanged.

## Verification and next scope

- `npm run check`: **189/189** tests, 31 files; typecheck/build/package import PASS.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- Diagnostic compiled Runner was used only as a temporary Paperclip Host pin for this isolated test. Permanent Host should remain its original rc.3 configuration unless a separate fix passes independent native E2E.
- [Open Issue #30](https://github.com/tibame201020/queqiao-harness-browser/issues/30) tracks this resumed-turn-specific failure. It must be fixed without relaxing wrong-conversation, stale/duplicate content, or single-send safety. The diagnostic-only PR is **not** proof of a fix.

## Updated in the same PR after user architecture decision

This original document describes the instrumentation-only stage of PR #31.
Its diagnostic-only assessment has since been superseded by
`ISSUE30_RESUME_FIRST_20261027.md`: a bounded Send check followed by
durable private Attempt and **read-only `resume` / `collect`**.
Paperclip Native lifecycle is not part of this generic Harness gate.
