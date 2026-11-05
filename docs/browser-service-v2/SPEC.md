# Browser Service V2 — Product and Domain Contract

Revision: proposed V2 implementation baseline, 2026-10-29. This is a plan, not a running service.

## Goal

An authorized Pi, OpenCode, n8n or other system configures a normal HTTP(S) **base URL** and credential to operate an authorized browser. The caller does not install Browser Harness, see a browser profile, depend on Queqiao, or know site adapter details. HTTP is an operation API, **not** an OpenAI-compatible model completion endpoint.

## Bounded contexts

| Responsibility | Owner |
| --- | --- |
| Task planning, approvals, dependencies and business retries | Caller / Paperclip / n8n |
| HTTP, authorization, Connection registry, Operation lifecycle and receipts | Browser Service |
| Browser process, profile/session, site adapter, Send Attempt, strict Send/Resume proof | Browser Harness |
| Site-specific ChatGPT turn interpretation | Existing Harness ChatGPT adapter |
| Native workflow graph, scheduler and execution | n8n (optional) |
| Remote MCP transport | Queqiao (optional) |

Do not create a second Send verifier, profile manager or workflow scheduler inside the service. Preserve an internal backend seam without implementing unused backends in V2.

## V2 first slice / non-goals

**Supported:** preconfigured/authorized Browser Connection → saved **existing ChatGPT Conversation** → one message Send → durable receipt → same-Send read-only Resume when UNKNOWN → Collect one stable assistant response linked to that Send.

**Not in V2:** new-conversation creation, generic browser RPA/CDP proxy, raw JS, public profile creation, generic provider support, a fixed n8n graph, webhook callback framework, job queue, Paperclip Issue CRUD, multi-owner Windows+WSL browser mutation, and automatic retry of an uncertain Send. Harness may already support these internally; the new HTTP contract does not promise them.

## Objects

**Client** is an authorized API consumer. **Connection** is a server-registered opaque handle to one owner-host-local Harness Profile. **Target** is a validated saved Conversation (provider + canonical ID/URL). **Operation** is a durable, client-owned request and result identity. **Send Attempt** is Harness's existing private durable proof created before possible message submission. **Receipt** distinguishes evidence of submission/completion from transport success. Full terms live in GLOSSARY.

## Lifecycle and proof

Operation states: accepted → running → submitted / completed / unknown / failed. A submitted Send means the original unique User Turn was verified using the existing Harness proof. A completed Collect means a stable full assistant reply was verified to follow the specified submitted Send in the exact owning conversation. HTTP 202, click success, blank composer, worker-generated marker, n8n success, and completed network request are **not** submission/completion proof.

An UNKNOWN Send may have been delivered. **Only a read-only reconcile of the same persisted Harness Attempt** may promote it to submitted; never resubmit. Missing/corrupt attempt, changed browser binding, mismatched target, duplicate/stale message, or denied content access yields UNKNOWN/quarantine. Do not clear a private Send lock merely because the service process has restarted. Even a known failed HTTP call does not establish that no browser Send occurred.

## Owner/lock model

One **Owner Host** controls one Browser Identity (profile + browser binding). Windows and WSL cannot independently act as safe co-owners with separate local lock files. Clients on other hosts use the HTTP URL.

All mutating pathways on the Owner Host (service, existing Harness extension, direct Runner/supervisor) must use a common physical-profile lock or be disabled for service-owned profiles. Harness's per-Send active.lock is not a substitute for the shared lease. A lock must survive concurrent processes and be recovered conservatively; it must never release an ambiguous Send's durable guard.

A Connection binding cannot be silently changed while any Operation/Attempt is unresolved. Retire/quarantine it with explicit operator action if proof is permanently unavailable.

## Durability and idempotency

Persist the client-scoped Operation acceptance and idempotency fingerprint **before** dispatch. Keep a durable 1:1 Operation→Harness Attempt mapping when an Attempt exists. Same client + Idempotency-Key + same canonical request returns **the same** Operation ID; a mismatched request returns 409 IDEMPOTENCY_CONFLICT. Fingerprint content using a stable secret-keyed HMAC, not a loggable raw prompt hash. Persist the secret in approved owner-local private storage, never Git.

V2 has **no queue**: busy Connection → 409 BROWSER_BUSY, without recording a later-to-be-dispatched job. A crash after acceptance must not cause automatic replay. If no definitive proof exists, recover as UNKNOWN/quarantined. Keep raw prompt only in memory during dispatch or in existing protected Harness Send Attempt where needed for strict read-only Resume. An accepted Operation is not authority to reconstruct/send a prompt after restart.

Persist safe metadata/status privately; public responses have bounded size and client authorization. Full model response is sensitive; if a restart loses in-memory response text, report result unavailable and require a new **read-only Collect**, never resend. Never garbage collect unresolved Attempt proof automatically; define retention/configuration and explicit operator handling for resolved records.

## Target and security

Connection IDs are allowlisted in server-local config. API clients cannot set browser profile paths, arbitrary URLs, debugger port, adapterConfig or CDP endpoint. Target includes saved Conversation ID + canonical URL; validate host, ID format, connection provider, exact identity match and authorized client before browser work. Reject mismatches rather than browsing elsewhere. Do not return actual conversation URL, profile location, cookies, prompt or binding hash in public error bodies, logs or CI.

Require API Bearer credential scoped to Connection and Operation. Loopback-only plain HTTP may be opt-in; remote requires TLS and restricted bind/firewall or approved proxy. Health never opens a browser. Errors use typed safe codes. Unknown fields are rejected to avoid accidentally exposing backend parameters.

## Public HTTP behaviors

The canonical proposed contract is OPENAPI.yaml.

- GET /v1/health: local service liveness only.
- GET /v1/connections: caller-authorized safe metadata/capabilities, no profile paths.
- POST /v1/operations: create **send** (Connection, Target, prompt) or **collect** (source submitted Send Operation ID) with Idempotency-Key.
- GET /v1/operations/{operationId}: client-scoped safe operation status and bounded authorized result.
- POST /v1/operations/{operationId}/reconcile: read-only resolution of an existing uncertain Send; never a new send.

Return 202 only after acceptance is durably recorded; 202 is not a terminal receipt. Unauthorized owner access uses 404 to avoid leaking existence. No operation may bypass the exact owning Connection.

## Verification and release acceptance

Contract validation (schema, status codes, bad inputs, idempotency); TDD negatives (duplicate send, wrong target, lock races, unknown/late Send, stale answer, restart); two-process shared-owner lock test and direct Runner-path coverage; HTTP tests against fake backend and real isolated process; Pi-compatible client using only base URL and credential; separately authorized, fresh synthetic saved Conversation E2E + independent receipt checks; GitHub Actions typecheck/test/build and security scan.

Release requires the HTTP service to start without Queqiao or Paperclip, preserve Harness recovery semantics, and let a **non-Pi** HTTP client replace Pi without modifying server or Harness. A documentation-only review does not establish any of these gates as passed.
