# Issue #63 — existing saved Conversation fifth-Turn read-only Resume (2026-10-30)

## Reproduced defect and ownership

In installed Browser Harness v0.5.11, an authentic fifth continuation in an existing saved Project Conversation returned `SEND_OUTCOME_UNKNOWN` after live UI bubble counts stayed `4→4`. The original one-click attempt was persisted. Its read-only `resume` later observed `0→10` transient User bubbles with a verified matching turn but still returned `pending/unknown` because `awaitPostClickSettlement` only confirmed `baseline + 1` live nodes. A separately reopened saved Conversation contained exactly five distinct User messages; its final message matched the original private 888-character Attempt. No evidence supports a second Send.

Scope: Browser Harness ChatGPT adapter's **existing saved-Conversation continuation** only. No Paperclip approvals, Board/Employee model, general policy engine, provider abstraction or unrelated first-Project change.

## Minimal fix

- Retain existing strict original-target/baseline/Composer logic for the actual Send. Keep **one Send only** and original Attempt lock semantics.
- If existing saved-conversation `resume` cannot settle against the transient view, reopen **the same already-known canonical saved UUID** in a separate read-only tab. Ignore momentary 0/10 wrapper counts; accept only when the saved view stabilizes at **baseline User count + 1** (in the reported case 4 + 1 = 5).
- Require exactly one matching complete original prompt across all saved User messages, and require that match to be the **last** User message. Re-check after a 600 ms saved-view dwell. Verify the original UUID and first-party saved Conversation route on each check.
- If no stable five-message view, foreign destination, wrong final source, duplicated matching User text, extra persisted User messages or ambiguous DOM remains, keep `pending/unknown`. No send button, editor interaction or generic gates were added to the read-only recovery.
- The new helper is private to `chatgpt-send.ts`; first-Project reconciliation from Issue #60 is unchanged.

## TDD and production evidence

- **RED:** on unchanged v0.5.11, a deterministic fifth-Turn `resume` with live `0→10` and independent saved `0→10→5` returned `pending/unknown`, despite one exact last original message.
- **GREEN:** the same test returns `submitted`. Negative cases (wrong final source, wrong saved UUID/origin, 6 real saved messages, duplicated exact prompt in an earlier User Turn, never-settled 10 nodes) remain UNKNOWN. All tests prohibit another Send.
- Full Windows candidate **297/297 PASS** (38 files), TS/build/package import/stateless Runner PASS, production npm audit 0 vulnerabilities; Issue #55/#57/#60 regression tests included.
- Candidate compiled 0.5.12 real Chrome/CDP: five consecutive synthetic Turns **in the same original Project Conversation**, all `Trigger submitted → Collect completed`, including a fifth 888-character source. Independent read-only tab: **5 different saved User messages + 5 Assistant messages**, fifth source exact, fifth reply exact, saved UUID correct, original Project membership verified.
- Candidate **read-only actual Runner Resume** was separately invoked against that already-saved fifth source using an isolated synthetic original Attempt with baseline 4. No Send was performed. It returned `submitted`, scrubbing original source and releasing the Attempt lock, then `Collect completed` with exact fifth reply.
- Complete feature owner acceptance requires merged main CI PASS and staged Windows/WSL installed Extension E2E. This synthetic verification **does not** represent native Paperclip CEO→Employee acceptance. The historical failed Run is not replayed.

## Hand-off

After Browser Harness verification and release, perform the already requested fresh, authorized Paperclip Native CEO/employee E2E in its owning workflow. Do not create new Browser Harness governance work.
