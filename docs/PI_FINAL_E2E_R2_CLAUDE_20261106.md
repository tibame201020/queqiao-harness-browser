# Pi Web Ask Final E2E — Round 2/4: Claude (2026-11-06)

**Original run result: BLOCKED — preexisting draft on the dedicated pinned Claude browser page.** Neither Windows nor WSL has a confirmed forced-consultation completion in this round. Do not carry forward an earlier prototype's Claude PASS. No code modification, browser send, tab creation, tab closure, release or merge was performed.

**Follow-up (same date):** After explicit user authorization to clear that draft, targeted TDD fixed an additional Claude ProseMirror multiline false-negative and the actual Windows/WSL Pi both passed strict context-aware forced consultation with durable `COMPLETED` evidence. The original BLOCKED rows below remain historically accurate. See [PI_R2_CLAUDE_AUTHORIZED_RETRO_20261106.md](PI_R2_CLAUDE_AUTHORIZED_RETRO_20261106.md) for all passing and failing run IDs and the final accepted result.

## Scope and setup

- Real installed Windows Pi and WSL Pi with the same revision of `feat/pi-completion-agent-aware` (`aef5719` at test start).
- Existing authenticated, provider-pinned Claude page, configured locally outside Git. Shared Orca browser lock across platforms.
- Synthetic local fixture and ACK; only the local Pi process reads the synthetic project. No private repository, credentials, identities or raw user draft contents copied into Git.
- E2E driver stops immediately on an observed `NOT_SENT` or `NOT_READY` and blocks a second Ask. This is an acceptance harness guard, separate from the installed native Pi unresolved-send guard.

## Observed evidence

| Scenario | Actual model-issued tools | Outcome | Job ID |
|---|---|---|---|
| WSL local-only `/ask-claude` | `read` ×1, `ask_claude` ×0 | **PASS**: reports synthetic `ProjectTag`, exits normally | `dc73b86c-5d36-4737-8813-5dd93448c808` |
| Windows local-only `/ask-claude` | `read` ×1, `ask_claude` ×0 | **PASS**: reports synthetic `ProjectTag`, exits normally | `43ed2237-d42b-401d-bebe-c42740736078` |
| WSL forced `/ask-claude` | `read` ×1, `ask_claude` ×1 | **BLOCKED**: `NOT_SENT / DRAFT_PRESENT`; no Collect or verified Web send | `39ed07ba-c307-4165-8b8c-e491c5d3e9bf` |
| Windows forced `/ask-claude` | `read` ×1, `ask_claude` ×1 | **BLOCKED**: `NOT_SENT / DRAFT_PRESENT`; no Collect or verified Web send | `194ab91d-2069-44ca-bb3f-7150ced76df2` |

Both platforms' preflight showed a Claude `/new` page with one visible editor, a **nonempty existing draft**, no generation in progress and `readiness=true`. Readiness indicates the pinned composer exists, not that it is unoccupied. The tests confirmed the same read-only draft fingerprint before and after the attempted forced consultations. The draft was **not modified or submitted**; its origin could not be independently established. The contents and fingerprint are intentionally omitted here.

Both forced-consult E2Es ended after the first `NOT_SENT` result; these are not successes or evidence of Claude completion. `NOT_SENT` was an explicitly verified *pre-click* refusal, not `UNKNOWN` after a possible click. No unrelated Orca page was targeted.

## Cleanup and resource checks

- At the final check, Windows and WSL reported **zero remaining Pi E2E agent processes**.
- The Windows/WSL shared Orca lock was absent after the tests.
- Windows Orca process baseline showed multiple existing Orca processes; the observed total working set is **not attributable to this E2E**. No leak or long-duration memory conclusion is claimed.
- The existing Claude draft remains preserved on the pinned page. No new browser tab was requested.

## Unblock and rerun

The user must first establish ownership/disposition of the nonempty draft on the dedicated Claude page, either by clearing it in the browser or explicitly authorizing its disposal. Do **not** overwrite it just to force a test green. After the pinned editor is confirmed empty on both platforms, run new synthetic request IDs and recheck:

1. Windows and WSL Pi `read → ask_claude` exactly once → read-only `collect_claude` until durable `COMPLETED` with `completion_evidence=latest-assistant-terminal-action-v1`.
2. Validate exact synthetic ACK and ProjectTag, native Pi Agent normal exit, browser identity isolation, no duplicate Ask, no orphan Pi processes and released shared lock.
3. Record each platform's actual outcome; if an Orca/Claude send issue is observed, Retro and TDD before further retries.

This blocked round does not authorize moving on to Grok with an implied Claude PASS; Round 3/4 and Round 4/4 remain **NOT_ATTEMPTED** in this final cycle.
