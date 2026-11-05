# Browser Service V2 — Model Provider Review Gates

Status: **specified, not executed**. 2026-11-05.

## D0 — Contract and feasibility

- SPEC, ADR, OpenAPI, Tickets and README all describe **model-provider substitution**, not Agent Tool, AgentHarness or public `/v1/operations`.
- `GET /v1/models`, `POST /v1/chat/completions`, JSON/SSE/standard error envelope are consistent.
- BSV2-001 checks **actual Browser producer** plus a real model client: validated tool call, native tool execution, `role: tool` follow-up, history, `finish_reason`, stream/cancellation behavior. The 2026-11-05 partial experiment is recorded in [FEASIBILITY.md](FEASIBILITY.md); **initial Pi tool use is not a full multi-turn PASS**.
- Failure to prove backend-native model semantics is **BLOCKED**. A text-only response, fake tool-call fixture, or curl 200 cannot pass.
- No private real profiles, conversation URLs/IDs, prompts, tokens, screenshots or answer text in repository/CI.
- Start from freshly fetched `origin/main`; preserve unrelated local main and existing worktrees.

## D1 — Ticket TDD

- Capture a real RED test with expected failure on base; implement bounded change; capture GREEN.
- Follow strict one-Send / UNKNOWN no-resend semantics.
- Validate negative cases: incorrect model, unsupported parameter, missing/invalid tool schema, tool ID mismatch, SSE malformed chunks, missing [DONE], cancellation, lost response, duplicate requests.
- Test both client-wire shape and producer origin. Valid JSON alone does not establish correct agent behavior.

## D2 — Independent source review

- Compare code and requests to accepted SPEC SHA and owned paths; inspect full diff and evidence.
- Reject a Provider-specific agent extension as substitute for model API compatibility.
- Reject fabricated tokens/usage, fake model provenance, silent parameter drops or tool calls invented from prose.
- Verify strict identity, profile owner lock, private Attempt recovery and role/history isolation.

## D3 — Integration and GitHub Actions

- OpenAPI lint/validation, typecheck, build, unit/integration tests, stream/tool-call fixtures and security checks run on the **exact PR head SHA**.
- A single test fixture or workflow success message is not a release proof.
- CI excludes real accounts, tokens, browser/profile state and raw user content.

## D4 — Real provider-only E2E and release

- Start BSV2 without Queqiao, Paperclip, n8n or Pi extension.
- Select configured BSV2 model in **unmodified Pi** via `models.json`, invoke model, receive tool call, allow Pi native harmless tool execution, return tool result, receive next model response.
- Repeat against independent OpenCode-compatible consumer by provider config only; same BSV2 server.
- Test text-only completion, wrong tool, stream on/off, timeout/abort, unknown Send (no automatic replay) and error handling.
- If any required capability is unverified, report BLOCKED/UNKNOWN; no merge, tag, release or compatibility claim.

## Evidence for each ticket

Record: ticket ID; accepted spec SHA; source/test head SHA; actual RED command/failure and GREEN command/counts; CI run URL; real (redacted) model request, browser Attempt and response identities correlated privately; native agent-loop/tool receipt; independent reviewer findings; PASS/FAILED/BLOCKED/UNKNOWN; documentation updates.

No historical E2E or previous design review counts as acceptance of this revised model API.
