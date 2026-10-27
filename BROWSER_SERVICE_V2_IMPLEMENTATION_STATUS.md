# Browser Service V2 — Implementation Status

Date: 2026-10-27

This branch is the coordinator's integration worktree, based on GitHub main commit `2606ef74391c50c559c4990ddd596396472c069e` (merged Harness Issue #30).

## Ownership

- `feat/bsv2-001-contract` / `queqiao-bsv2-contract`: OpenAPI schema and contract tests.
- `feat/bsv2-002-engine` / `queqiao-bsv2-engine`: Harness engine entrypoint without Queqiao Worker dependency.
- `feat/bsv2-003-lock` / `queqiao-bsv2-lock`: common-core physical-profile lock primitives and tests.
- `feat/bsv2-integration` / `queqiao-bsv2-integration`: coordinator review, cherry-pick/integration and full regression tests.

## Gate

1. Each contributor commits a TDD change with RED and GREEN evidence.
2. Coordinator reads every diff and verifies no browser profile, credential, prompt or private receipt enters Git.
3. Coordinator integrates in dependency order 001 -> 002 -> 003, resolves conflicts in this branch, runs npm typecheck/test/build/package tests.
4. No merge, tag, release or live browser dispatch until integration checks pass.

## Scope

Browser Service is standalone HTTP/API-first and independent of Queqiao, Paperclip, Pi and n8n runtime. Harness is its initial internal backend. The current V2 HTTP send contract targets existing saved ChatGPT conversations only; unknown sends are never replayed.

## Status

- [x] Isolated physical worktrees created at verified `origin/main` base.
- [ ] BSV2-001 commit/test evidence.
- [ ] BSV2-002 commit/test evidence.
- [ ] BSV2-003 commit/test evidence.
- [ ] Integration review and test evidence.
