# Browser Service V2 — Model Provider Implementation Tickets

Status: **planned, NONE implemented or accepted as complete**. Revised 2026-11-05. Replaces the 2026-10-29 operation-first task scopes. IDs BSV2-001..011 are planning IDs, not GitHub Issues; historical worktree names are not acceptance evidence.

**BSV2-001 empirical status: PARTIAL / BLOCKED for full acceptance.** Real Browser tool choice and **unmodified Pi 0.80.1 native `bash` tool execution** through a disposable Model API fixture were observed; the subsequent Pi `role: tool` model continuation returned `502 RESPONSE_UNVERIFIED`, with Browser Collect `EMPTY_ASSISTANT_TEXT`. No downstream ticket is unlocked by a first-tool-use success. See [FEASIBILITY.md](FEASIBILITY.md) for exact evidence, RED→GREEN tests, explicit unverified claims and safe next gate.

## Acceptance hierarchy

1. **BSV2 behaves as an LLM model endpoint**, not as an Agent Tool. Consumer changes only normal model configuration (`baseUrl`, `api`, model ID, credential). It does not install a BSV2-specific Pi/OpenCode extension or wrapper.
2. **Existing agent loop stays unmodified.** Pi receives model output, executes its native tools if and only if the response contains correctly formatted, model-generated, validated `tool_calls`, sends `role: tool` results, and resumes.
3. **Actual Browser Harness** is the backend. A fake OpenAI response, browser-text-only demonstration, custom tool invocation, or curl-only probe does not satisfy real-provider acceptance.
4. Every compatibility claim needs real evidence. Unsupported tool/role/stream semantics are **BLOCKED**, not silently emulated by fabricated structured calls.
5. All code implementation uses TDD RED→GREEN, independently reviewed source diffs, GitHub Actions CI and sanitized, authorized synthetic E2E evidence. Never commit local browser state, credentials, real IDs, responses, or prompt bodies.

**Engineering boundary:** BSV2 owns model HTTP translation, internal request/Attempt correlation and authenticated server. Existing Browser Harness owns browser execution, Send proof, Collect and read-only Resume. The agent continues to own planning, tool execution and its while loop; no governance is added.

## Dependency graph

| Ticket | Deliverable | Depends on | Primary proof |
| --- | --- | --- | --- |
| BSV2-001 | Feasibility spike + canonical model-wire contract | none | Actual Browser text → valid structured tool call + subsequent tool result; real API client fixture |
| BSV2-002 | API history → Browser transcript projection | 001 | Role and multi-turn fidelity including tool history |
| BSV2-003 | Browser output → Chat Completion tool-call conversion | 002 | Exact tool name, call ID, JSON args, finish_reason, negative cases |
| BSV2-004 | Chat Completion SSE and cancellation | 002, 003 | Native streaming client, chunk/tool-call order, abort |
| BSV2-005 | Independent HTTP model server, auth, model catalog | 001 | /v1/models, /v1/chat/completions, provider-only config |
| BSV2-006 | Shared physical-profile owner lock and original Attempt safety | 001 | Two-process contention, no ambiguous resend |
| BSV2-007 | Internal correlation, failure mapping and recovery | 002, 006 | Single-send/no-blind-retry, unknown/error, restart |
| BSV2-008 | Browser Harness-backed model API E2E | 003, 004, 005, 007 | Real Send/Collect → exact model response, no fake shortcuts |
| BSV2-009 | Unmodified Pi model-provider acceptance | 008 | Only models.json, native tools, history, follow-up |
| BSV2-010 | Independent OpenCode/custom-model acceptance | 008 | Only standard provider config, same endpoint |
| BSV2-011 | CI, review, release and documentation closure | 009, 010 | Required Actions and real end-to-end evidence |

No bulk implementation proceeds if BSV2-001 concludes the Browser UI cannot support the required agent-loop semantics. Preserve the failure as a product feasibility blocker; do not pivot to a Tool integration without a new decision.

## BSV2-001 — Provider compatibility feasibility gate (FIRST)

**Goal:** Prove the product is feasible before building the server. Investigate the real Pi `openai-completions` requests, model stream parser, tool schemas, role history, streaming and cancellation. Use a disposable minimal adapter fixture to exercise real Browser Harness; do not call a normal text reply a tool call.

**Owned paths:** `docs/browser-service-v2/SPEC.md, docs/browser-service-v2/OPENAPI.yaml, docs/browser-service-v2/TICKETS.md` as applicable, `test/provider-compatibility/*` disposable fixtures, `docs/browser-service-v2/FEASIBILITY.md` if needed.

**RED:** Existing Browser Harness result is text-only; no demonstrated valid `tool_calls`/tool_result round-trip. Record exact missing fields and observed real client behavior. Unsupported request features must not be silently dropped.

**GREEN / PASS:** One real model request with a harmless tool schema produces a correctly named, correlated JSON tool call; the unmodified native client dispatches the tool and sends a `role: tool` result; a second model response consumes that result. Verify role isolation, text-only control, no unintended tool dispatch, SSE envelope/cancellation expectations. If live provider cannot satisfy this, return **BLOCKED**, not GREEN.

**Evidence:** Real Browser receipt, sanitized exact request/response schemas, API parser tests, honest tool-call origin, source SHA, limits and independent reviewer. No full model API parity claimed from a fixture alone.

## BSV2-002 — History and conversation identity

**Goal:** Convert full `messages` history to Browser input and correlate responses without requiring a caller-supplied Browser Conversation ID.

**RED:** Subsequent model call loses system/user/assistant/tool turns, leaks another session, duplicates history, or mistakes last text for current turn.

**GREEN:** Server-owned Browser target and transcript mapping preserve request ordering and tool_call_id associations, reject ambiguous continuation, and never leak Browser target. Test first turn, two continuations, concurrent clients with same prompt, role-specific escaping, prompt-injection boundaries, and history overflow.

**Evidence:** Deterministic fixtures and a real multi-turn Browser test. Do not assert native role fidelity unless proven.

## BSV2-003 — Structured model response and tool calls

**Goal:** Normalize verified Browser response to OpenAI Chat Completions assistant output, with validated `tool_calls`.

**RED:** Ordinary prose is misread as a tool call, malformed JSON is executed, tool names not in provided `tools` are accepted, call IDs are lost, or `finish_reason: stop` is emitted after a tool call.

**GREEN:** Exact tool name, indexed/correlated call IDs, JSON arguments validated against declared schema where supported, `finish_reason: tool_calls`, correct follow-up tool_result interpretation; no model tool execution inside BSV2. Honest failure if the Browser cannot provide reliable structured output.

**Evidence:** Fake backend unit tests PLUS real-site producer proof, no reconstructed fake tool call as end-to-end evidence.

## BSV2-004 — Streaming, timeout and abort

**Goal:** Conform to `stream: true` SSE frames for text and tool calls.

**RED:** Returns application/json or 202 on stream, lacks `[DONE]`, emits malformed deltas, claims token streaming while buffering, drops a call ID, or retries Send after disconnect.

**GREEN:** Correct ordered `chat.completion.chunk` frames, valid final finish_reason, `[DONE]`, early disconnect handling and bounded timeout semantics. If only buffered output is possible, document actual latency and prove real-client timeout compatibility.

**Evidence:** Stream parser fixtures + real Pi streaming consumption; cancellation never resends UNKNOWN.

## BSV2-005 — Independent model HTTP server

**Goal:** Start BSV2 without Queqiao/Paperclip/n8n. Expose `GET /v1/models`, `POST /v1/chat/completions`, `GET /health`, model registry and bearer auth.

**RED:** Pi requires an extension or Browser-specific fields; clients may submit profile paths/CDP URLs; unknown model falls back; auth or model catalog leaks private target.

**GREEN:** Model-ID-only selection; standard request body and response; no required Idempotency-Key, Conversation URL, Operation ID or MCP Tool; authorized server config maps model to private Browser identity; typed errors and safe liveness.

**Evidence:** Real launched server process, OpenAPI validation, anonymous/wrong-model tests.

## BSV2-006 — Physical Browser owner and Send safety

**Goal:** Share one owner lease across service, Browser Harness Runner, extension/supervisor entrypoints.

**RED:** Concurrent service and Runner Send both proceed; a stale lock or crash clears unresolved original Attempt; Windows/WSL each believe they own one profile.

**GREEN:** Single owner, second process refuses or conservatively quarantines, original no-resend/read-only Resume preserved. No extra browser execution engine.

**Evidence:** Two-process lock fixture and original Harness regression suite.

## BSV2-007 — Correlation, recovery and failure semantics

**Goal:** Keep the model API stateless to callers while tracking private Browser attempt, response, and completion evidence.

**RED:** HTTP timeout triggers duplicate Send; `202` passes as completion; repeated body without key silently replays an unresolved Attempt; wrong output is returned on recovery.

**GREEN:** Server-owned one-Send record, conservative UNKNOWN fencing, read-only recovery, explicit model error envelope/status, optional idempotency header but no mandatory nonstandard input. Do **not** claim exactly-once guarantees absent caller correlation identity.

**Evidence:** Crash-injection, restart, near-simultaneous retry and no-private-log tests.

## BSV2-008 — Model endpoint backed by actual Browser Harness

**Goal:** Integrate model API routes with authorized Browser trigger/collect/resume, not fake LLM responses.

**RED:** Browser answer text is returned as 200 when tool/role/answer proof fails; unrelated conversation text is treated as model output; model ID accepts arbitrary Browser URL.

**GREEN:** Successful real Browser prompt-to-model response; strict message/tool/finish_reason attribution, safe errors, full accepted transcript; one actual Browser Send per original request. No direct agent Tool API.

**Evidence:** Fresh isolated synthetic E2E and real response conformance; unknown remains non-success.

## BSV2-009 — Pi as pure model consumer (PRIMARY ACCEPTANCE)

**Goal:** Configure the **actual installed Pi** with standard `models.json` only:

- `api: "openai-completions"`; `baseUrl: "http://127.0.0.1:8766/v1"`; `apiKey: "$BSV2_API_KEY"`; model ID registered by BSV2.
- No Pi extension, custom tool, new RPC command, agent loop change, or direct Harness MCP use.

**RED:** Model selection works but no native Pi tool call occurs, Pi cannot consume SSE, `tool` message is lost, or Browser input requires a custom field.

**GREEN:** Real Pi sends API request, accepts provider response, executes one harmless **existing** Pi tool from validated `tool_calls`, sends result in next request, and receives continued answer. Confirm regular model switching and no BSV2-specific Pi code.

**Evidence:** Pi version/config identity, sanitized HTTP trace and tool execution receipt, no user files/credentials. The "Pi can ask browser" Tool path does not count.

## BSV2-010 — Independent provider-only consumer

**Goal:** Verify the same BSV2 endpoint with current OpenCode custom `@ai-sdk/openai-compatible` provider configuration (or another ordinary client if its installed contract differs). Never modify service per consumer.

**RED:** Needs a custom Browser Tool/Adapter, invalid tool result, unsupported SSE, special header/session URL, or incompatible error shape.

**GREEN:** Only ordinary model provider config changes. Native client model call, tool-use, follow-up, and error consumption work against the same API.

**Evidence:** Versioned consumer config (sanitized), actual request/response and independent run transcript.

## BSV2-011 — CI, independent review and release

**Goal:** Confirm tested behavior equals advertised compatibility, update docs, ensure no secrets.

**RED:** GitHub Actions misses OpenAPI/stream/tool-call tests or allows a text-only fake to pass the model-provider gate.

**GREEN:** GitHub Actions on exact integration SHA runs schema validation, typecheck, build, unit/integration tests, negative state/lock/error cases; independent reviewer reads diffs and real receipts; full unmodified Pi + second client E2E passes.

**Evidence:** PR, commit SHA, CI run URL, sanitized observed Browser + agent loop logs, explicit PASS/BLOCKED/UNKNOWN for each capability. No merge/tag/release without completed gates.

## Execution and worktree rules

Start from the latest fetched `origin/main`, not the unrelated local main. Use isolated worktrees with assigned file ownership. Original 2026-10-29 BSV2 worktrees contain no accepted implementation and must not be taken as proof or rebased destructively without comparing their current state. Planner may use Queqiao/n8n to distribute implementation, but workflow terminal status never decides code acceptance or product correctness.

Each implementation ticket returns: ticket ID, accepted spec SHA, base/head SHAs, changed paths, genuine RED test and failure, GREEN verification commands and counts, remaining compatibility gaps, review evidence. No model or browser content enters Git or CI.
