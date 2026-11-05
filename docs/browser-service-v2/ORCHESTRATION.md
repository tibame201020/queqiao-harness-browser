# BSV2 — Optional Engineering Orchestration

Status: engineering instructions only; **no workflow started**. Revised 2026-11-05.

## Product boundary

BSV2 exposes an LLM **model API** to existing agents. It is not an n8n, Queqiao, Paperclip or Orca orchestration product. Do not insert n8n into request handling, require any Browser Harness tool in Pi, or design an agent loop. **BSV2-009** is validated by changing Pi's ordinary model-provider config, not by writing a Pi Tool.

Existing Browser Harness owns native browser/session/Send/Collect/Resume. BSV2 owns HTTP translation, model catalog, internal correlation and error mapping. External frameworks already own their own tool execution.

## Engineering procedure (when later authorized)

1. Read the accepted SPEC and OPENAPI, check current GitHub main and source; independently confirm the installed Pi model request/response protocol and Browser Harness capabilities. Do not assume a model's UI text can represent structured tool calls.
2. Execute **BSV2-001 feasibility first**: actual Browser Harness → valid model `tool_calls` → native tool execution → `role: tool` follow-up; check stream/role fidelity. If BLOCKED, stop, write evidence; do not plan full implementation as if feasibility passed.
3. After a passing gate, dynamically plan only ready Tickets from [TICKETS.md](TICKETS.md). Planner may use native n8n as an engineering task distributor, or implement directly. No fixed graph, Worker count, or synthetic terminal proof.
4. Assign isolated worktrees from newest `origin/main`, each with owned paths, deterministic RED test, expected GREEN result and independent reviewer. Workers are coders, not final acceptance authorities.
5. Inspect real commits/diffs and fresh unit tests. Verify native n8n execution separately if used; n8n node success never implies model-API parity, code correctness, or release readiness.
6. Integrate in dependency order; rerun full tests and GitHub Actions on exact head SHA. Review output/private-data exclusion.
7. Run actual **unmodified Pi model-provider** and independent consumer E2E. Verify real agent tool-calling loop, not an HTTP text reply or Browser Tool. Update docs with observed limitations and release proof.

## Evidence and privacy

Keep nonsecret ticket/commit/test/CI evidence. Never store or publish private profiles, session URLs, actual prompt, account identity, tokens, screenshots, raw model replies or resolved browser conversation IDs. An ambiguous original Browser Send remains non-replayable without read-only proof.

The historical 2026-10-29 G2 graphs and older BSV2 operation-first ticket instructions are not reusable as this revised Model Provider acceptance.
