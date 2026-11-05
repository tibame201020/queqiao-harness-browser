# Browser Service V2 — Model Provider Backend

Status: **documentation-only proposal, not implemented**. Revised 2026-11-05.

## What BSV2 does

BSV2 exposes Browser Harness as an **LLM Model Provider API**. Pi, OpenCode, Orca and compatible agents select it exactly like a configured Ollama/vLLM-compatible model: set a model ID, `api`, `baseUrl`, and credential. The agent makes its ordinary model request, receives model output, and continues its **existing agent loop**. BSV2 is **not an Agent Tool, Agent adapter, scheduler, or governance system**.

A successful text response is **not** sufficient to establish agent-provider compatibility. Pi's coding loop depends on model-originated `tool_calls`, role-aware history, `role: tool` results and stream semantics. Real Browser UI may not support faithful conversion. **BSV2-001 feasibility is the first gate; if it fails, do not claim drop-in compatibility.**

## Proposed public surface (not running)

- `GET /v1/models`
- `POST /v1/chat/completions` — OpenAI Chat Completions JSON and SSE
- `GET /health` — service health only

Original Send / Collect / Resume / Attempt handling stays **behind** this API, in BSV2 and Browser Harness; a consumer does not need `/v1/operations`, a Browser Conversation ID or a Browser-specific tool.

### Pi configuration example (TARGET ONLY)

Example for `~/.pi/agent/models.json` with an environment-provided API key:

```json
{
  "providers": {
    "bsv2": {
      "baseUrl": "http://127.0.0.1:8766/v1",
      "api": "openai-completions",
      "apiKey": "$BSV2_API_KEY",
      "models": [{ "id": "browser-chatgpt" }]
    }
  }
}
```

This is **not** a working integration claim. Model name, availability, tool capability and context metadata must be confirmed by implementation and runtime conformance. No Pi Extension, tool registration or agent-loop changes are allowed for the main acceptance.

Pi reference: https://pi.dev/docs/latest/models

OpenCode reference: https://opencode.ai/docs/providers (custom OpenAI-compatible provider via `baseURL` and `@ai-sdk/openai-compatible`).

## Read in order

1. [SPEC.md](SPEC.md) — product target, real provider parity, error/recovery limits.
2. [OPENAPI.yaml](OPENAPI.yaml) — **proposed** model wire interface and errors.
3. [ADR-0001.md](ADR-0001.md) — why model API replaces public operation API.
4. [TICKETS.md](TICKETS.md) — BSV2-001..011, dependency graph and RED→GREEN/real-E2E gates.
5. [REVIEW-GATES.md](REVIEW-GATES.md) — strict completion evidence.
6. [GLOSSARY.md](GLOSSARY.md) — model protocol vs Browser private state.
7. [ORCHESTRATION.md](ORCHESTRATION.md) — optional engineering execution handoff only.

Authority: user-approved product goal → SPEC → OpenAPI → Tickets → actual current source/runtime evidence. No contradictory scope should be silently implemented.

There is no deployed BSV2 server in this documentation work. User credentials, actual Browser profile paths, conversation URLs/IDs, prompt text, real response content and private receipts must not be written to Git or CI.
