# Browser Service V2 — Model Provider API Contract

Status: **proposed, NOT IMPLEMENTED**. Revised 2026-11-05. Supersedes the 2026-10-29 operation-first proposal.

## Product goal and non-goals

BSV2 exposes Browser Harness as a **model backend** over a standard LLM API. An existing agent (Pi, OpenCode, Orca, etc.) changes only its model/provider configuration: `baseUrl`, `api`, credential, model ID. The agent sends model requests and receives model responses through its **existing model call**. Its own reasoning loop, tools, scheduler, and governance remain unchanged.

Acceptance is **NOT** "Pi can invoke a browser tool." No Pi extension, MCP tool, Orca AgentHarness, custom CLI wrapper, workflow node, or agent loop patch is permitted to establish the primary acceptance claim.

BSV2 is a black box: HTTP model protocol outside; Browser Harness trigger/collect/resume and authenticated browser inside. It is **not** an Agent Runtime, orchestration framework, general-purpose browser/CDP proxy, or alternative tool dispatcher. Queqiao, n8n, Paperclip, Pi, and Orca are optional consumers, not startup dependencies.

## Target API and verified references

Initial target: **OpenAI Chat Completions** (`openai-completions`), via:

- `GET /v1/models` — available service-configured model IDs and explicit capability metadata.
- `POST /v1/chat/completions` — standard model request/response, including `stream: true` SSE.
- `GET /health` — independent liveness, outside the model protocol.

Do not advertise `/v1/responses`, Anthropic Messages, embeddings, audio, image input/output, or universal OpenAI parity without separate conformance proof.

References:
- Pi model configuration: https://pi.dev/docs/latest/models
- Pi agent loop: https://pi.dev/docs/latest/how-pi-works
- Pi custom providers (used only if an API is unsupported): https://pi.dev/docs/latest/custom-provider
- OpenCode custom provider: https://opencode.ai/docs/providers
- OpenAI Chat Completions: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- OpenAI streamed chunks: https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events

The exact installed Pi/OpenCode versions and compatible request/response behavior must be observed during implementation. A documented example is not runtime proof.

## Primary acceptance: provider substitution

With the **unmodified, real Pi executable** and its standard `models.json` entry pointing at BSV2, Pi must:
1. Select BSV2 as its model and send a real Chat Completions request with system/user/assistant/tool history and the tools it already has.
2. Receive protocol-correct model output, including **structured tool calls** where tools are requested; execute those calls with its existing tool dispatcher, without BSV2 knowing or invoking Pi's tools.
3. Send the resulting `role: tool` messages in a subsequent model request, then receive an attributable follow-up response.
4. Handle `stream: true`, cancellation, an error, and one multi-turn continuation without an extension or change to Pi's agent loop.

A successful text-only chat, a curl response, or a separate Pi Tool call is **insufficient**. The same condition applies to OpenCode as a second, independent provider-config consumer. A test may use a harmless synthetic tool; never write real credentials or user data to CI.

**Critical feasibility risk:** Web ChatGPT and other browser sites expose human-facing text, not proven native OpenAI `tool_calls` frames or guaranteed tool-result role semantics. They might not safely represent the tools, history, system roles, finish reasons, or streaming semantics required by an agent loop. The early **BSV2-001 feasibility gate** must prove end-to-end tool-call fidelity with real Browser Harness evidence; do not infer compatibility from correctly formatted response JSON or from model-written prose. If this gate fails, mark full model-provider parity **BLOCKED**, report the actual missing capability, and do not claim completion by fabricating `tool_calls`.

## Wire semantics

Requests use the published OpenAI Chat Completions shape, not a bespoke `{prompt}` or `sendOperationId` API. At minimum validate `model`, ordered `messages` (including `system`/`developer` as negotiated, `user`, `assistant`, `tool`), optional `tools`/`tool_choice`, `stream`, and supported generation settings. Either implement a field faithfully or return a documented unsupported-parameter error. Do not silently ignore tool definitions or history.

For non-streaming success, return `chat.completion` with a valid assistant message, content or validated `tool_calls`, accurate `finish_reason`, stable response ID and model. `finish_reason: tool_calls` requires actual validated calls with tool-call IDs, tool names from the supplied allowlist, and well-formed arguments. Do not translate ordinary advice/text into unauthorized tool executions. Never synthesize usage/cost/token counts as if measured.

For `stream: true`, respond with valid `text/event-stream` ChatCompletionChunk events and `data: [DONE]`. Respect indexed and correlated tool-call deltas; a buffered-after-Collect stream may be conformant in structure but is **not real-time token streaming** and must be tested against real clients and their timeouts. Cancellation must stop active work where safely possible; it cannot undo a possibly submitted browser Send.

Standard errors have a stable model-API error envelope and HTTP status. No `202 accepted` as the final answer to a model request, no 200 OK with an incomplete result, and no silent retries of an uncertain Send. Requests unsupported by the backend must fail explicitly; do not return a text-only substitute to a request needing tool calls.

## Conversation and tool-history translation

Browser UI conversations are **not** native model API conversations. Normal Chat Completions clients send the full message history and do not send a Browser conversation URL, session ID, or custom operation handle. BSV2 must keep Browser profile/Conversation/Attempt identity **server-side**, with an explicit, tested projection from API history to Browser input, and from Browser output to model response.

The first-turn route, subsequent-turn mapping, role boundaries, tool-call IDs, and tool-result history require evidence. No client modification or extra `conversationId` field is allowed. Never assume a browser Conversation matches a tool transcript merely because its latest text looks similar. If accurate history/role continuation is impossible, fail the relevant capability gate rather than presenting altered semantics as native.

Use only server-registered model IDs. Each model maps privately to an authorized Browser Harness provider/profile policy; requesters cannot supply site URLs, CDP/debug endpoints, profile paths, or login credentials. A model can advertise `tools: true` only after the real round-trip passes. Do not claim model context size, token limits, or tool support from guesses.

## Lifecycle, durability, and error ownership

Keep existing Browser Harness ownership of actual browser sessions, one-owned Send, proof of submission, Collect, and read-only Resume. BSV2 may persist private internal operation/attempt IDs; they do **not** become mandatory fields in a Chat Completions request.

A server-side Send result has distinct states: not_sent, submitted, completed, unknown. A browser click or HTTP acknowledgement is never proof of delivery. An ambiguous Send may already have occurred: keep the original Attempt, reconcile it **read-only**, and never dispatch a replacement automatically. An HTTP client retry has no intrinsic idempotency key; optional `Idempotency-Key` can improve deduplication but **must not be required** for standard Pi/OpenCode requests. Without caller identity, BSV2 must not promise exactly-once behavior across arbitrary retries: fence unresolved browser identities conservatively and surface a recoverable operational error.

One Owner Host controls each Browser identity. All mutation entrypoints (service, direct Runner, extension/supervisor) must honor the same physical owner lease or be disabled on service-owned profiles. Windows and WSL must not independently mutate the same browser profile. Never publish private prompts, Browser profiles, conversation URLs/IDs, cookies, screenshots, model secrets, or unredacted responses in Git/CI.

The model backend may be unavailable, slow, challenged, rate-limited, or unable to verify a response. Fail with explicit safe error semantics; do not pretend a browser-generated partial/unknown result is a successful model completion. Service startup and `GET /health` must not require Queqiao or launch Chrome.

## Explicit deferrals

- No framework-specific wrapper, Pi Tool, OpenCode Tool, Orca AgentHarness, Paperclip native API, or n8n graph.
- No generic browser RPA/JavaScript/CDP passthrough or arbitrary public profile creation.
- No guarantee of backend-native function calling, true incremental token streaming, true token usage, guaranteed role fidelity or model context size **until verified**.
- No additional model APIs before OpenAI Chat Completions conformance and real-client acceptance.

## Verification and release gates

1. **Feasibility first:** executable real-site/synthetic tool-call + tool-result continuation, history mapping, cancellation, and streaming evidence. Fail or mark BLOCKED if Browser UI cannot satisfy the model contract. Browser Send must be exactly once.
2. Machine-validate OpenAPI 3.1 against implementation; test supported/unsupported fields, strict errors, `stream` and tool-call sequence, privacy, auth, crashes, duplicate requests, and UNKNOWN recovery.
3. Unmodified Pi model configuration only: model selection, actual request, harmless tool invocation through Pi's native dispatcher, tool-result round-trip, and subsequent model request.
4. Independent OpenCode-compatible provider test using configuration only. No Browser-specific code installed in either agent.
5. TDD RED→GREEN on each implementation Ticket; unit/integration tests in GitHub Actions on exact PR SHA; independent review and fresh authenticated synthetic browser E2E. Do not merge/release from text-only tests or documentation claims.

If proof fails, keep the contract and record an explicit product feasibility blocker; do not silently switch back to Tool-based integration.
