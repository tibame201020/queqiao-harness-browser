# BSV2-001 — Browser-backed Model Provider Feasibility Record

Date: 2026-11-05 (Asia/Taipei)
Scope: BSV2-001 only; **isolated synthetic proof**, not Browser Service V2 implementation.
Decision: **PARTIAL / BLOCKED FOR FULL AGENT-LOOP ACCEPTANCE**. Do not unlock dependent implementation tickets or claim release readiness.

## Product acceptance being tested

An unchanged Pi agent must select Browser Service as its **model** through normal `models.json` (`baseUrl`, `api: openai-completions`, key and model ID). Pi's ordinary model call returns structured `tool_calls`, Pi's **existing tool dispatcher** executes a harmless tool, Pi submits a `role: tool` result, and the Browser-backed model returns a verified final response in the same native agent loop. A separate Pi Tool, custom provider extension, Orca AgentHarness or n8n workflow is not a substitute.

## Actual runtime observations

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Installed Pi version | **0.80.1, observed** | Existing installed `@earendil-works/pi-coding-agent` executable, not a mock Pi |
| Browser Harness extension | **0.5.19, observed** | Queqiao discovery and real isolated CDP Browser Profile; no production profile modified |
| Pi configured as model provider | **PASS** | Isolated runtime-only `models.json`; `pi --offline --list-models browser-chatgpt` listed `bsv2/browser-chatgpt` |
| Real Browser dynamic function choice | **PASS (synthetic)** | Model selected `multiply_integers` from two tools, supplied correct integer arguments and its own call ID; Browser Trigger `submitted`, Collect `completed` |
| Real Browser simulated tool-result continuation | **PASS (synthetic manual)** | Same Browser Conversation received a synthetic tool-result message and eventually produced the correct final answer. Collect initially `pending`; later **read-only Collect**, no re-Send, returned `completed` |
| HTTP endpoint fixture liveness and model catalog | **PASS** | Local-only ephemeral `/health` and `/v1/models` |
| Pi direct model API → native tool execution | **PASS (one iteration)** | Real Pi `--mode json` emitted assistant `toolUse` / `tool_execution_start bash` / `tool_execution_end bash` / `toolResult`. No Pi extension or agent-loop change |
| Pi continuation `role: tool` → final verified model response | **NOT PASS** | Pi's following model requests returned `502 RESPONSE_UNVERIFIED`; later Browser Collect was `pending`, first `NO_ASSISTANT_MESSAGE` then `EMPTY_ASSISTANT_TEXT`; no final response verified |
| Real-time token streaming | **UNVERIFIED** | Fixture buffers Browser Collect and only then emits OpenAI-shaped SSE. Successful initial Pi tool-call consumption is not evidence of true incremental token streaming |
| Restart/durable idempotency, concurrency, arbitrary roles/tool schemas | **UNVERIFIED** | Fixture deliberately lacks production durable operation and owner-lock architecture |

**Critical provenance distinction:** The real Browser backend produced a *JSON text representation* of intended tool calls under an explicit model-output protocol prompt. The disposable server validated function names, call IDs, argument JSON and a subset of JSON Schema, then converted it into OpenAI Chat Completions `tool_calls` / SSE chunks. This shows an experimentally viable **semantic conversion path**, not that the ChatGPT website exposes native API function-call events. Unsupported role fidelity, schema constructs or malformed content must fail closed.

## Reproduced TDD defects in the feasibility fixture

1. **HTTP response skipped despite completed Browser reply.** The fixture used `req.destroyed` after consuming the request body as a proxy for disconnected clients, skipping the HTTP response. A deterministic local HTTP POST test reproduced an unanswered request (RED timeout), then passed after switching to response lifecycle state (`res.destroyed || res.writableEnded`). This explains the first Pi run's waiting despite an independently completed Browser Collect.
2. **Automatic HTTP retry could issue a second Browser request after an ambiguous result.** A negative test first produced `502` for both identical requests (RED). A bounded, **in-memory fail-closed/quarantine guard** now returns `502` on the original unresolved attempt and `409` on subsequent requests without re-entering the Browser backend (GREEN). This is a safety test, not a durable idempotency implementation.

Targeted local test: `node --test test/provider-compatibility/bsv2-gateway.node-test.mjs` — **6/6 PASS** after RED→GREEN. The repository's normal `npm run check` now includes this test so GitHub Actions exercises it.

## Second-run failure and safe handling

The second real Pi attempt selected the configured Browser-backed model and executed its native `bash` tool successfully. After the `toolResult`, the test gateway returned `502 RESPONSE_UNVERIFIED`; Pi's standard model API retry behavior produced retry events. The test agent and HTTP fixture were stopped to avoid additional Browser Sends. A subsequent **read-only** Collect on the available original Browser target did not verify a final assistant reply (`EMPTY_ASSISTANT_TEXT`). No previously uncertain Send was intentionally replayed for diagnosis.

This is **NOT** proof that Browser Harness cannot support continuation: an independent synthetic manual Browser follow-up had succeeded. It is evidence that the full Pi→BSV2→Browser→Pi round-trip is **not yet accepted**, and that retry/correlation is a real production requirement.

## Feasibility code / limitations

- `scripts/bsv2-model-provider-feasibility.mjs`: **test-only**, optional local HTTP server and direct existing Harness Runner subprocess. It contains no credentials, real Browser URL, cookies, private user data or saved account identity.
- `test/provider-compatibility/bsv2-gateway.node-test.mjs`: fake backend unit tests for prompt roles/tool schemas, strict model JSON, OpenAI-shaped ChatCompletion/SSE, response delivery and no-resend quarantine. Fakes only validate wire handling; they do not prove live Browser capability.
- All live tool/browser observations and native Pi logs remained in private local runtime; do not attach raw logs, prompts, screenshots, conversation URLs or tokens to GitHub.

Fixture restrictions: no durable request store, no persistent owner lock, no guarantee of exactly-once on process restart, no full JSON Schema validator, no real-time token streaming, no multi-provider claims, no role isolation proof. It must not be deployed as a production BSV2 server.

## Decision / next evidence before PASS

1. Determine **why the first native Pi tool-result continuation did not yield a verifiable Browser assistant message**, using the original read-only Browser evidence only. Distinguish delayed hydration/site fault, transcription/prompt mapping, runner scope and HTTP timeout. Do not infer a cause without reproduction.
2. Verify real Pi `role: tool` request mapping and the Browser target/Attempt binding while guaranteeing **no duplicate Send** on client retry, timeout, failure or restart. The in-memory fixture quarantine is insufficient for production.
3. Repeat with a **fresh synthetic Browser Profile and fresh Pi isolated config**, after a deterministic TDD regression is available; require an unmodified native Pi `bash` tool execution followed by a second real model response and a final `agent_end` without errors.
4. Then inspect `stream: true` and cancellation semantics, unsupported parameter mapping, full role/history fidelity, and provider interoperability before closing BSV2-001 or starting downstream implementation.

**Current acceptance:** Model endpoint selection and one native Pi tool iteration PASS; end-to-end Pi continuation **BLOCKED**. No BSV2 implementation/release completion claim.
