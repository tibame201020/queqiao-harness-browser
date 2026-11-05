# Browser Service V2 — Domain Glossary

**BSV2 / Model Backend**: Independent HTTP service presenting Browser Harness as a model provider; not an Agent Runtime or Tool.

**Agent / Model Consumer**: Pi, OpenCode, Orca or another unmodified agent loop that calls its selected model API.

**Model Provider Configuration**: Consumer-owned `baseUrl`, `api`, credential, model ID. No extension, additional Tool, or framework-specific Browser adapter.

**Chat Completions Request**: Standard `model` + ordered `messages` and optional `tools`, `tool_choice`, `stream`. Not a Browser script or single prompt.

**Model Response**: Protocol-correct assistant message or SSE chunks; can contain validated `tool_calls` and an accurate `finish_reason`. Plain text alone does not prove coding-agent compatibility.

**Tool Call**: Model-generated, structured instruction delivered **to the existing agent loop**. BSV2 never executes the agent's tools.

**Tool Result**: `role: tool` message the agent sends back on its next model request, linked by `tool_call_id`.

**History Projection**: Internal conversion from a model API transcript to one or more Browser UI turns. Fidelity must be evidenced, not assumed.

**Model Capability**: Only an observed and tested supported feature, e.g. tool calling, streaming, history, input/output types. No guessed model metadata.

**Connection / Browser Identity**: Server-private association between a model ID and a browser profile/provider with an exclusive owner.

**Owner Host**: Sole host authorized to mutate one physical Browser identity.

**Send Attempt**: Browser Harness-private original submission evidence; it may not be replayed if the outcome is uncertain.

**Collect / Resume / Reconcile**: Browser Harness internal result collection or read-only verification of the original Attempt; not consumer-facing model commands.

**UNKNOWN**: Submission or result possibly occurred but cannot be proven; not equivalent to safe-to-retry.

**Idempotency**: Optional caller-supplied request identity can help, but no nonstandard required field may be imposed on Pi's ordinary model request.

**Completion**: Verified model API response semantics; distinct from HTTP 202, browser click, or model-written textual claim.

**Workflow**: Optional external n8n graph; not part of BSV2 or an agent model loop.
