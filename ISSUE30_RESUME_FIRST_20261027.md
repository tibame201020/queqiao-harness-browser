# Issue #30 — Resume-first Browser Harness Send reconciliation

## Product boundary

Browser Harness transports one Send and checks the target, attributable User Turn,
exact content and settled editor. It **does not** govern Paperclip Native Done,
CEO/Head agents, workflow scheduling, response quality, or model inference time.
Assistant response time is a separate `collect` concern and can scale with model
workload and upstream latency. Raising Send confirmation delay cannot fix all causes.

## Root cause and scope

Original WEB-63 reproduced an unknown Resume Send after 20 post-click samples
without a new User Turn; later independent read-only reopening saw an additional
User Turn. Its exact first-appearance time and full original equality remain
unknown. An independent installed rc.4 7,156-character generic Resume completed
Send confirmation within 5 seconds; therefore do **not** claim that increasing
the timeout alone fixes WEB-63. PR #31 initially added count-only diagnostics.
This change implements a **read-only, durable resume path** in the same PR.

## Contract

For a ChatGPT Profile resuming an *existing canonical saved Conversation*:

1. Validate original editor and exact prompt, correct authenticated target and
   Send actionability. Just before the single real Send, durably write a private
   `send-attempts/<UUID>.json` receipt (owner-only permissions) holding the
   full original source, expected Conversation UUID, two selector baselines and
   Browser Profile binding. An exclusive per-profile active lock prevents
   concurrent unknown Sends. If persistence fails, do not click Send.
2. Return the original `triggered/submitted`, `unavailable/not_sent`, or
   `ambiguous/unknown` as before, augmented with a non-secret `attemptId`
   for possible-click receipts. A pending attempt continues to block new
   Trigger calls, including force/acknowledgement bypass, even after crash.
3. Expose `harness_run({name,action:"resume",args:{attemptId}})`. Resume loads
   the exact profile-scoped private attempt, checks Browser configuration
   binding and expected Conversation UUID, opens that canonical URL, and
   invokes **only** the original post-click content/user-turn/empty-editor
   verifier. It never calls Send, inserts text or restarts the original Run.
4. `submitted`: exactly one new User Turn relative to the saved baseline,
   exact source or existing conservative formatting proof, correct saved
   target, empty composer and continuous stable dwell. Mark the original
   receipt submitted atomically, release exclusive active lock, clear its
   persisted ambiguity flag, then permit independent `collect`.
5. `pending/unknown`: absent, foreign, wrong, stale, duplicate, folded-mismatch,
   missing composer, wrong target or unhydrated state. Remain locked; a later
   Resume is allowed and **never** sends again. A previous submitted receipt
   is idempotent on subsequent Resume calls.
6. The first-new-chat case without a canonical saved Conversation is not
   supported for read-only Resume. Never reinterpret a `local-chatgpt:`
   provisional URL as confirmed, and never guess the Conversation target.
   The normal first-new-chat Trigger path remains unchanged.

The full original source is stored only under the runtime's *private*
profile directory for exact Markdown validation, not Git or MCP output.
The record uses owner-only file permissions on supported OSes and is not
automatically deleted (manual retention review needed for sensitive prompts).
No cookies, OAuth tokens, profile passwords, external user IDs or raw DOM
are copied into this repository.

## TDD

- New isolated tests were RED against missing `send-attempt` store and
  `reconcileChatGptSend`, GREEN after adding only those capabilities.
- Verify private receipt survives reload, exact identity and profile binding,
  wrong profile/ID rejection, concurrent unknown attempt refusal,
  repeated submitted idempotence, delayed correct User Turn match without
  Send, absence/wrong content/duplicate/wrong origin fail-closed.
- Verify pre-click hook invoked exactly once for a verified Resume
  and never for an unrelated draft; no raw source in tool results.
- Required final gate: full TDD/typecheck/build/audit, fresh exact-HEAD GitHub
  Actions, actual installed Windows/WSL runtime and read-only generic
  `harness_run resume` real Conversation proof. Paperclip E2E excluded.
