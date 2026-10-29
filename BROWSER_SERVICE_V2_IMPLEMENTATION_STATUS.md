# Browser Service V2 — Coordination status

Updated: 2026-10-29.

## Document baseline (this branch)

- The proposed domain/API design, 11 dependency-ordered Tickets, Glossary, ADR, n8n-driven handoff and Review Gates live in docs/browser-service-v2/ (see README).
- Machine-readable OPENAPI.yaml is a proposed **documentation contract**, not a currently implemented server.
- The approved older architecture review in conversation is historical context only. This versioned document set does not inherit those reviewers' acceptance evidence.
- No Browser Service code, new RED/GREEN tests, CI acceptance, HTTP runtime or E2E completion is claimed.

## Existing isolated worktrees (created previously)

- feat/bsv2-001-contract — queqiao-bsv2-contract (not yet delivered)
- feat/bsv2-002-engine — queqiao-bsv2-engine (not yet delivered)
- feat/bsv2-003-lock — queqiao-bsv2-lock (not yet delivered)
- feat/bsv2-integration — queqiao-bsv2-integration (Coordinator documentation baseline)

The three implementation worktrees were originally created at 2606ef7; they must reconcile with the accepted current origin/main and this Spec commit before any coding. The Coordinator's documentation branch was independently rebased onto latest observed origin/main during the documentation pass. The repository's unrelated local main may diverge; do not reset or overwrite it.

## Next action, not part of this delivery

When specifically authorized, use docs/browser-service-v2/ORCHESTRATION.md with the installed Queqiao-n8n orchestration Skills to perform capability discovery and dynamically plan the **next ready Ticket**. Require real worktree commit/test/independent review evidence before expanding to more Tickets. Do not reuse historical n8n E2E topology or claim background execution was scheduled by this document.
