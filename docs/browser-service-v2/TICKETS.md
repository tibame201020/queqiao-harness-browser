# Browser Service V2 — Implementation Tickets

Status: **planned, no ticket accepted as implemented**. Parent [SPEC.md](SPEC.md), wire contract [OPENAPI.yaml](OPENAPI.yaml), execution gates [REVIEW-GATES.md](REVIEW-GATES.md). Ticket IDs are planning identifiers, **not** created GitHub Issue numbers.

## Execution model

One task-specific native n8n Workflow **per actual task or coordinated batch**, not a hardcoded graph reused from a prior E2E. Planner chooses dependencies/agents from current availability, owner paths and runtime capabilities. Each implementation Worker has an independent Git worktree and creates a commit. The coordinator reads diffs, verifies tests and integrates only accepted commits. The graph execution ID and the code commit ID are different proof types.

**Before any ticket:** read accepted Spec SHA, current code, package scripts and installed Queqiao/n8n tools. Check new main changes (notably Resume behavior). Start from latest accepted main in a clean isolated worktree; preserve the existing diverged local main. Every ticket produces a RED failure first, then GREEN tests. Sanitized receipts only.

## Dependency graph

| Ticket | Description | Depends on | Parallel guidance |
| --- | --- | --- | --- |
| BSV2-001 | Machine-checkable HTTP Contract | none | start |
| BSV2-002 | Harness internal execution seam | 001 | parallel with 003,006 |
| BSV2-003 | Shared owner-host physical-profile locking | 001 | parallel with 002,006 |
| BSV2-004 | Dynamic saved Target with verified identity | 002,003 | sequential shared Runner path |
| BSV2-005 | Collect causality and strict reply attribution | 004 | after dynamic Target |
| BSV2-006 | Independent HTTP process, auth and Connection registry | 001 | parallel with 002,003 |
| BSV2-007 | Durable Operation state, idempotency and crash handling | 006 | after HTTP scaffold |
| BSV2-008 | Send operation / Harness Attempt integration | 002,003,004,007 | after shared state and guards |
| BSV2-009 | Read-only reconcile and causal Collect HTTP integration | 005,007,008 | integration |
| BSV2-010 | Pi and generic HTTP consumer compatibility | 006,008,009 | thin caller only |
| BSV2-011 | CI, live acceptance, docs and release gate | 001–010 | final verification |

## BSV2-001 — API Contract and schemas

**Objective:** Pin a machine-validated external interface independent of Harness command parameters.

**Owned paths (proposed):** docs/browser-service-v2/OPENAPI.yaml, src/service/contracts.ts, src/service/contracts.test.ts, optional scripts/check-browser-service-contract.*. This existing proposed YAML is documentation; it does not by itself close this ticket.

**RED:** test contract parser/generator consistency, required routes/operationIds and strict request schemas; demonstrate failure on unknown fields, unsupported URL/profile/CDP override, missing Idempotency-Key, mismatched Send/Collect shapes, invalid HTTP/error status.

**GREEN:** exact OPENAPI endpoint/method set and unique operationIds; request/response types validated; safe codes, authentication, payload bounds; no accidental /v1/chat/completions or raw Runner leakage.

**Done evidence:** failing then passing test output, schema lint result, code diff, accepted OpenAPI version and coordinator approval.

## BSV2-002 — Internal Harness execution seam

**Objective:** Call existing Runner/core from an independent process without loading Queqiao Extension registration. Preserve one actual Harness browser implementation.

**Owned paths (proposed):** src/core/harness-engine.ts, src/core/harness-engine.test.ts; minimal compatible src/runner.ts changes when necessary.

**RED:** fake engine unit test for execute/status/resume that fails when importing requires Queqiao Extension runtime; test result status mapping so outer {status:ok} cannot imply submitted/completed.

**GREEN:** bounded internal interface selected by Service; no second browser/session/adapter implementation; original extension/Runner commands unchanged; direct existing Harness regression tests still pass.

**Done evidence:** executable server-side import smoke test independent of Queqiao, RED/GREEN and full relevant regression.

## BSV2-003 — Physical-profile owner lock and quarantine

**Objective:** Prevent competing Service/Runner/supervisor writers on the same Owner Host.

**Owned paths (proposed):** src/core/profile-owner-lock.ts, src/core/profile-owner-lock.test.ts, minimal src/runner.ts entrypoint wiring and tests. Does not delete Harness Send Attempt active.lock.

**RED:** two separate OS processes using the same owner/profile both believe they can mutate; direct Runner bypass and stale-lock/crash cases fail.

**GREEN:** single owner; second caller receives BROWSER_BUSY or fail-closed quarantine; stale lock cannot be stolen when an unresolved Send is present; no false cross-Windows/WSL safety guarantee; release only verified owner lease, never unknown Attempt.

**Done evidence:** actual process-level contention fixture plus Runner/supervisor path tests, not an in-memory-only mutex.

## BSV2-004 — Runtime dynamic saved Target binding

**Objective:** Permit the authorized HTTP Target to be chosen per Operation without mutating saved Profile config or evading strict Resume comparison.

**Owned paths (proposed):** src/core/target-binding.ts, src/core/target-binding.test.ts; affected Runner/ChatGPT adapter integration.

**RED:** wrong ID/URL pair, wrong provider, another Connection's target, illegal host and changed binding are rejected before any side effect. Existing static adapter config must not silently select a different conversation.

**GREEN:** runtime operation target is verified, bound to the persistent original Attempt, and honored on read-only Resume; provider identity cannot be swapped. Existing Harness direct callers remain compatible.

**Done evidence:** verified ID/URL identity and wrong-target negatives, existing strict Resume tests green.

## BSV2-005 — Collect attribution to original Send

**Objective:** Verify exact causal assistant answer, not merely latest visible text.

**Owned paths (proposed):** src/core/collect-proof.ts, src/core/collect-proof.test.ts, minimal existing ChatGPT Collect adapter integration.

**RED:** stale assistant answer, another Agent's turn, pending/partial text, duplicate candidate, wrong conversation and missing original Send are all rejected.

**GREEN:** only a stable completed answer attributable to the submitted original Send can produce response_verified; uncertain cases stay pending/unknown. No parser duplicate of Harness semantic proof.

**Done evidence:** adversarial deterministic tests and live-site contract parity tests.

## BSV2-006 — Independent HTTP server and connection authorization

**Objective:** Start, stop and health-check HTTP Service without Queqiao/n8n/Paperclip.

**Owned paths (proposed):** src/service/http.ts, src/service/connection-registry.ts, src/service/auth.ts, tests and independent executable entrypoint.

**RED:** unauthorized caller can list or operate Connection, incorrect profile/config leaks, health opens browser, non-loopback binds insecurely.

**GREEN:** local-config allowlist, bearer auth, client scopes, 401/404-safe errors, constrained bind/TLS policy, graceful shutdown, safe GET /health and /connections.

**Done evidence:** launched child process integration test and HTTP responses, no Queqiao runtime imports.

## BSV2-007 — Durable operation store and idempotency

**Objective:** Stable operation ID and crash safety independent of Runner Run ID.

**Owned paths (proposed):** src/service/operation-store.ts, src/service/operation-state.ts, src/service/idempotency.ts plus tests.

**RED:** restart duplicates a Send; same key with changed body reuses old Operation; busy request is queued; an unscoped client sees another client's result; expired cleanup deletes unknown Attempt.

**GREEN:** durable-before-dispatch accepted state; monotonic transitions; stable keyed HMAC request fingerprint and re-opened store; identical request returns original ID; conflicting payload 409; crash before observed proof yields unknown/quarantine, not replay.

**Done evidence:** process-restart fixtures, high-contention same-key tests and private-data static inspection.

## BSV2-008 — HTTP Send and original Harness Attempt mapping

**Objective:** Execute one saved Conversation Send through internal Harness only, with 1:1 durable Operation-to-Attempt relationship.

**Owned paths (proposed):** src/service/send.ts, src/service/send.test.ts and minimal required internal engine adapter wiring.

**RED:** timeout/repeated POST triggers second Send; crash before/after click bypasses unknown; accepted HTTP response incorrectly means submitted; another target or profile slips through.

**GREEN:** authorize + lock + persist Operation → one Harness trigger → persist private Attempt mapping → expose status; unknown freezes additional Send; no prompt replay on reboot.

**Done evidence:** fake-engine exactly-one Send counts, crash injection, actual Runner receipt integration.

## BSV2-009 — Read-only reconciliation and Collect routes

**Objective:** Finish public /reconcile and Collect workflow using existing Attempt and causal response evidence.

**Owned paths (proposed):** src/service/reconcile.ts, src/service/collect.ts and tests.

**RED:** reconcile performs a Send; missing/corrupt Attempt unlocks profile; Collect accepts unrelated/partial response; GET leaks content across clients; process restart falsely retains unavailable text.

**GREEN:** reconcile same Send only; unknown → submitted only with proof; quarantine otherwise; Collect requires submitted sendOperationId, exact Target and verified stable response; authorized result or RESULT_UNAVAILABLE with read-only recollect policy.

**Done evidence:** matched operation/attempt IDs in runtime-only fixture and no duplicate dispatch across restart.

## BSV2-010 — Thin Pi and non-Pi HTTP clients

**Objective:** Demonstrate base URL + API credential consumer integration, not an additional browser runtime.

**Owned paths (proposed):** examples/pi-client/ or separate thin Pi Tool adapter, examples/generic-http/, tests. Exact Pi extension/Tool registration mechanism must be confirmed against **actual installed Pi runtime** before code.

**RED:** client assumes Queqiao Tool, Harness Profile path or local browser; cannot recover API timeout safely; mishandles accepted vs completed.

**GREEN:** Pi Tool uses configured URL + credential to send/poll/reconcile/collect; generic independent HTTP client exercises same contract; no server source changes between clients. Never claim that setting Pi LLM provider baseUrl alone registers REST tools.

**Done evidence:** test scripts and two different client runtime receipts, sanitized.

## BSV2-011 — CI, independent review and release acceptance

**Objective:** Integrate the full feature with controlled release evidence.

**Owned paths (proposed):** .github/workflows/*, README/docs/browser-service-v2, packaging/start scripts, synthetic tests and review packet.

**RED:** CI misses contract test, negative concurrency, no-Queqiao launch, or content-leak scan; misleading HTTP 202 treated as completion.

**GREEN:** GitHub Actions runs contract/TS/test/build/package checks on integration SHA; two-process owner lock, crash/unknown/read-only Resume and exact-target causal Collect tests pass; fresh authorized synthetic saved ChatGPT conversation E2E; generic HTTP/Pi interchange; no secrets/private identity in reports.

**Done evidence:** CI run URL and SHA, independent review with zero unresolved blockers, E2E redacted receipt, explicit decision on merge/tag/release. No auto-merge on an n8n Workflow terminal marker.

## Ticket completion packet

Each worker returns only: Ticket ID, source Spec SHA, base/head commit SHA, modified paths, RED test name and failure reason, GREEN commands/result counts, discovered contract mismatch or outstanding blocker, sanitized handoff summary. Coordinator independently checks real files and CI. n8n workflow receipt is **additional orchestration evidence**, not code acceptance.
