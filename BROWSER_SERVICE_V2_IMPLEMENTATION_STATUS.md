# Browser Service V2 — Documentation / Implementation Status

Updated: 2026-11-05.

## Current product target

**BSV2 = OpenAI Chat Completions-compatible Model Provider endpoint over Browser Harness.**

Existing Pi/OpenCode/Orca agents should only change ordinary model provider configuration (URL/API/model/credential); no new Browser Tool, CLI Agent Adapter, Planner, orchestration or agent-loop modification. Real model `tool_calls`, native tool_result continuation, history and streaming require an explicit feasibility gate before full implementation.

The previous 2026-10-29 **operation-first public HTTP API** is superseded. Internal Browser Send/Collect/Resume and durable Attempt/UNKNOWN handling remain required, but no public `/v1/operations` polling contract is the primary consumer interface.

## Delivery state

- Revised SPEC, OpenAPI, ADR, TICKETS, README, Glossary, Review Gates and optional engineering handoff are **design documents**.
- **No BSV2 model-provider implementation or real Pi/OpenCode model-API E2E has been accepted.** Do not infer compatibility from existing Browser Harness trigger/collect or Pi Tool experiments.
- The first implementation task, BSV2-001, is the **real Browser-backed model API/tool-call feasibility gate**. A failure blocks claims of drop-in agent substitution.
- **2026-11-05 observation (research branch):** native Pi 0.80.1 selected the Browser-backed Model API via isolated `models.json` and executed its built-in `bash` tool; its subsequent model continuation returned `502 RESPONSE_UNVERIFIED`. Browser Collect remained unverified (`EMPTY_ASSISTANT_TEXT`). BSV2-001 is **PARTIAL/BLOCKED**, not PASS. Detailed sanitized evidence: [FEASIBILITY.md](docs/browser-service-v2/FEASIBILITY.md).
- GitHub Actions, RED/GREEN implementation tests and release evidence are future execution gates, not claims established by this documentation update.

## Historical worktrees

The 2026-10-29 worktrees `feat/bsv2-001-contract`, `feat/bsv2-002-engine`, `feat/bsv2-003-lock` and `feat/bsv2-integration` were created for the **superseded operation-first design**. Historical status: document-only baseline or unstarted implementation. Do not reuse their original Ticket scopes without reviewing the revised contract.

The revision branch `docs/bsv2-model-provider-contract` starts from current fetched `origin/main` and carries the original documentation commits plus this revised specification. It must not reset, overwrite or silently rebase the unrelated local `main`.

## Next engineering gate (not executed in this document task)

Run BSV2-001 with actual current Pi and Browser Harness. Produce sanitized request/response and tool-call evidence or an explicit BLOCKED report. Only then schedule downstream Tickets.

No real Browser profile, credentials, user content, conversation ID/URL or private runtime receipt belongs in Git/CI.
