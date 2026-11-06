# Native Pi + Orca Web Provider — Four-Round Final E2E Summary (2026-11-06)

## Scope

Four separate provider rounds exercised the **installed native Pi Agent Loop** on both Windows and WSL, with a private provider-pinned authenticated Orca browser tab and a **synthetic** local project fixture. For each provider, Pi first read the fixture, and the external model was asked to return the file-derived ProjectTag (not revealed in the originating prompt). This tests project-aware context selection rather than simple `/ask` passthrough. The explicit no-external-consultation case required Pi to read the same fixture and perform **zero** Ask calls. Test drivers also rejected repeated Ask attempts and nonterminal/no-evidence answers.

## Per-provider acceptance

| Round | Provider | WSL forced consult | Windows forced consult | E2E report |
|---|---|---|---|---|
| 1/4 | ChatGPT | PASS (2 final Retro fresh requests) | PASS (3 final Retro fresh requests) | [Round 1](PI_FINAL_E2E_R1_CHATGPT_20261106.md), [Retro](PI_R1_WINDOWS_FORCED_CONSULT_RETRO_20261106.md) |
| 2/4 | Claude | PASS (strict project-context test) | PASS (strict project-context test) | [Round 2](PI_FINAL_E2E_R2_CLAUDE_20261106.md), [Retro](PI_R2_CLAUDE_AUTHORIZED_RETRO_20261106.md) |
| 3/4 | Grok | PASS (strict project-context test) | PASS (strict project-context test) | [Round 3 and Retro](PI_FINAL_E2E_R3_GROK_20261106.md) |
| 4/4 | Mistral | PASS (strict project-context test) | PASS (strict project-context test) | [Round 4 and Retro](PI_FINAL_E2E_R4_MISTRAL_20261106.md) |

For every final observed case, the durable Request Journal held `COMPLETED`, exact file-derived answer, valid `prompt_hash`, provider-canonical conversation identity and `completion_evidence=latest-assistant-terminal-action-v1`. The final runs used one Ask per user prompt and finished without related Pi child-process leftovers or shared browser lock leftovers. This is evidence for tested cases, **not a lifetime reliability guarantee**.

## Issues discovered and fixed during the four rounds

1. **False Web completion:** a 650ms stable answer was previously sufficient, even while the site was generating. Completion now requires stable, provider-specific **latest-message terminal UI action** across two read-only inspections. Legacy completions without evidence must be rechecked.
2. **Agent-aware question and no ambiguous resend:** `/ask-gpt`, `/ask-claude`, `/ask-grok`, `/ask-mistral` route to the existing Pi Agent Loop, which may read context and honor explicit consultation requirements. A per-user-prompt guard blocks a rewritten second Ask while an original same-provider request is in flight, PENDING or UNKNOWN. Original receipts remain durable; Collect/Status are read-only.
3. **WSL Orca bridge working directory:** Orca subprocess no longer inherits Pi's arbitrary project cwd, which had caused an observed readiness failure on an ephemeral fixture.
4. **Provider UI variability:** ChatGPT enabled Send readiness, Claude onboarding modal, and ChatGPT/Claude/Grok/Mistral ProseMirror logical newlines required independent DOM checks and narrowly scoped fixes. Claude and Grok use exact paragraph reconstruction for composer integrity; Mistral also needs it for the **already-sent user bubble** to verify the original prompt after Enter.
5. **Post-click ambiguity:** Mistral's initial `UNKNOWN / POST_CLICK_UNVERIFIED` was proven to be an already-sent request with the wrong user-bubble text extraction. After TDD, the original request was recovered read-only and stored as `COMPLETED` without resending. ChatGPT's intermittent Windows Click no-op is **not conclusively root-caused**; the conservative readiness check and duplicate-send guard reduce its impact but do not prove it impossible.

## Engineering delivery boundary

- Both installed native Pi extensions have been source-hash checked against the working branch. All final E2Es used synthetic fixtures only; no real repository contents, credentials, personal file paths, private browser session IDs or raw receipts were added to Git.
- Latest engineering checks after the Mistral fix: WSL `npm run check` **42/42 Vitest files and 93/93 Pi Node tests PASS**, Windows native **93/93 Pi tests PASS**. Final-commit GitHub Actions results are tracked separately and must be confirmed before release.
- **Draft PR #81**: branch `feat/pi-completion-agent-aware` against `feat/pi-chatgpt-tool`. Do **not** interpret four passing provider E2Es as approval to merge to `main` or publish. Review/merge policy and the parent branch's state remain independent gates.
- Further quality work: independent code review of completion, journal reconciliation and Pi event-hook boundaries; longer soak/resource testing if long-running stability is a release requirement; monitor provider UI drift. A future UI change must fail closed and be reconfirmed with a fresh DOM POC.

**Observed four-provider Final E2E acceptance is complete; release readiness is a separate decision.**
