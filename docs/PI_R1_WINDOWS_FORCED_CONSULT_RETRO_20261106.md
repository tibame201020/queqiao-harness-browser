# Windows Pi ChatGPT forced-consultation Retro — 2026-11-06

## Scope and verdict

This is the targeted follow-up to [Round 1/4 ChatGPT final E2E](PI_FINAL_E2E_R1_CHATGPT_20261106.md), not a new four-provider acceptance run. Local tests used **synthetic project fixtures only**; no user code, credentials, session metadata, or file paths were supplied to any Web provider. Original `UNKNOWN` receipts were retained. No merge, release, or publication was performed.

**Observed retest verdict:** final installed Windows Pi and WSL Pi completed the forced ChatGPT consultation using real Pi Agent loops and authenticated Orca Web ChatGPT tabs. Windows passed **3 independent new requests**, including **1 after the final guard-event refinement**; WSL passed **2 independent new requests**, including **1 after the final guard-event refinement**. All observed requests were `read → ask once → read-only collect → COMPLETED`, with exact ACK and project context. Native Pi and browser outcomes were observed, not inferred from unit tests alone.

## Retrospective: symptom, evidence, cause separation

The original Windows E2E (job `5ddcb3d0-2ca7-49c9-821a-717a94850f9d`) returned `UNKNOWN / POST_CLICK_UNVERIFIED` from `ask_chatgpt`. `collect_chatgpt` and `chatgpt_status` could not reconcile it, and the 9B Pi model attempted another Ask. The E2E monitor stopped the second attempt. A read-only browser check found the exact original synthetic draft in the pinned home-page composer and no corresponding User/Assistant turn. The durable receipt remained `UNKNOWN`; no claim of a successful or unsuccessful click was fabricated.

The issue has two independent layers:

1. **Intermittent Send UI outcome, not yet a proven deterministic root cause.** A read-only Windows preflight (job `ae2535be-b26d-4ffe-9aa6-74ee95f92a84`) confirmed the enabled, visible `type=submit` button with the localized Send label after fill; the test draft was cleared. A separate **single-click** isolated Ask (job `4f13f9ee-737f-4f17-885a-a80c700b1e13`) successfully created a new conversation, returned `PENDING`, then reached `COMPLETED` by read-only Collect. Therefore the Orca Click command can work; the earlier no-op cannot be conclusively attributed to a specific lower-level Orca/Web race from these traces.
2. **Confirmed Agent safety gap.** Request Journal deduplicates the same `request_id` or exact default question, but a small model can reword the question and create a *new* request ID while the first send outcome is uncertain. A natural-language instruction to avoid resending was not reliably obeyed. This is independently reproducible with a seeded synthetic `UNKNOWN` receipt and native Pi event-hook tests.

## Minimal TDD fixes

- **Read-only ChatGPT Send readiness:** `orca-cli.mjs` inspects the actual composer form's visible, enabled `type=submit` control. After exact draft/hash verification it requires **two consecutive ready observations**, rather than trusting a transient accessible snapshot ref alone. If readiness never settles, it returns `NOT_SENT / SEND_CONTROL_NOT_READY` **before** attempting Click. It never automatically clicks twice or interprets a successful CLI Click as a completed send. This is a **conservative race mitigation**, not proof that every future browser no-op is eliminated.
- **One unresolved send per provider per user prompt:** the new `agent-send-guard.mjs` observes Pi's native `before_agent_start` (fresh user prompt boundary) and `tool_call` events. The first Ask for a provider is reserved before execution; an in-flight, `PENDING`, or `UNKNOWN` outcome blocks a later Ask for that provider in the *same user prompt* with `{block:true, terminate:true}` and the original receipt ID. `collect_*` and `*_status` remain available. A matching verified `COMPLETED` result releases the hold, allowing further independent queries within the same user prompt. Different providers remain independent; definite pre-click `NOT_SENT` does not trigger this restriction. No global attempt quota, no additional agent or workflow governance was added.
- **Actionable tool result:** an unresolved Ask returns its `request_id` plus an explicit read-only Collect/Status next action. It does not silently retry. The guard does not delete or reclassify journal records.
- **TDD:** new regressions cover disabled→enabled Send transitions, no click while disabled, stable ready→single click, parallel sibling Ask, reworded Ask after UNKNOWN, unrelated provider independence, a new user prompt resetting guard, and release after Collect **or Status** proves completion.

## Final acceptance evidence

| E2E scenario | Native Pi observations | Result | Job ID |
|---|---|---|---|
| Windows forced consultation, new request 01 | Read×1 → Ask×1 → Collect×2, `PENDING→COMPLETED`, exact ACK | PASS | `c41f07e5-b7ec-4522-814a-1f065e29db07` |
| WSL forced consultation, new request 01 | Read×1 → Ask×1 → Collect×2, `PENDING→COMPLETED`, exact ACK | PASS | `e35c6e17-7a40-4d22-8ede-659db92ee6b7` |
| Windows forced consultation, new request 02 | Read×1 → Ask×1 → Collect×2, `PENDING→COMPLETED`, exact ACK | PASS | `7a01d33a-86f0-4458-a174-418d3bd148d8` |
| Windows forced consultation, new request 03 (final guard-event revision) | Read×1 → Ask×1 → Collect×2, `PENDING→COMPLETED`, exact ACK | PASS | `0a748b45-db8e-4284-9676-28ba26097e85` |
| WSL forced consultation, new request 03 (final guard-event revision) | Read×1 → Ask×1 → Collect×2, `PENDING→COMPLETED`, exact ACK | PASS | `e4caad58-a5a0-49df-b675-3df0309892a8` |

- Windows **3/3** and WSL **2/2** new forced-consultation E2Es passed. Each provided the correct synthetic ProjectTag and requested exact ACK; none attempted a second Ask.
- A separate read-only journal audit confirmed all five result receipts were `COMPLETED`, contained the exact synthetic ACK and a SHA-256 prompt hash, and carried `completion_evidence=latest-assistant-terminal-action-v1`. Earlier ambiguous receipts were still present. No local raw prompt was committed to Git.
- The Windows and WSL shared Orca lock was released after testing. Process checks found **0** task-related Pi / test-worker processes remaining on each platform. Long-duration memory-leak testing is outside this Retro.
- The last verified source check completed with **85/85 Pi Node tests**, **42/42 Vitest files** and `npm run check` exit 0. Fresh GitHub Actions results for the final commit must be verified separately before final handoff.

## Residual uncertainty and scope

The original low-level Windows `POST_CLICK_UNVERIFIED` remains an **intermittent, not fully root-caused browser/Orca interaction**. Success on three fresh Windows requests plus a conservative pre-send readiness check is encouraging but does not establish statistically guaranteed reliability. The Agent-side **unsafe duplicate-send behavior is blocked by a deterministic native Pi event guard**, even when the small model proposes an altered question; live E2Es all used the normal success path, while the forced blocking scenario is covered by isolated deterministic tests.

Do not merge until independent review, current-commit CI, and any other required provider-round acceptance gates are complete. Claude, Grok and Mistral final rounds remain separate from this ChatGPT Retro.
