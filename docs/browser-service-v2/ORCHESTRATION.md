# Browser Service V2 — n8n-driven Agent Engineering Playbook

Status: instructions for **future invocation**. This documentation task does not create, trigger or activate any n8n Workflow.

## Authority and tool boundaries

The originating ChatGPT session is the **Coordinator / Planner**. Use the installed Queqiao-n8n Workflow Orchestration plugin as guidance, not as an extra permission system. The Planner may compose a task-specific native n8n graph; n8n owns its graph and execution. Queqiao-n8n controls native n8n APIs. Browser Harness owns Browser conversations and Send/Collect/Resume. Git/worktree operations execute only through an authorized coding Host (for example the Queqiao PC coding workspace), **not** through unaudited Code nodes or guessed shell capabilities.

**Do not confuse this engineering orchestration with Browser Service product behavior.** Browser Service does not depend on n8n. The n8n plugin may be used to implement/test the service, and can later be its ordinary HTTP consumer.

## Required plugin Skills and references

At task time, load installed:
- queqiao-n8n-dynamic-workflow (router) and references/capability-discovery.md
- n8n-native-workflow for native graph lifecycle
- n8n-execution-evidence for independent terminal evidence
- browser-harness-worker only if the task actually uses browser-based workers or real E2E
- conversation-result-routing only if a verified result must return to first_worker or bound_origin
- references/acceptance-playbook.md for fresh E2E; never reuse old fixture graph

Each Host (ChatGPT, Pi, Claude Code) must discover its **actual tools and permissions**. Skills describe procedures but do not grant a missing shell, n8n bridge, Browser profile, credential, GitHub connector or background-agent facility. If a capability is absent, classify BLOCKED with its owner; do not create an unauthorized alternative.

## Coordinator procedure

1. **Preflight:** fix the accepted Spec commit SHA; reread TICKETS, source files, GitHub main and latest CI. Discover actual authorized Queqiao environments, n8n_health/auth_status, supported native n8n_workflows, n8n_trigger_workflow, n8n_executions and node schemas, plus any relevant Browser Harness capabilities. Check installed n8n node versions/transport. Record safe worktree roots and conflicts.
2. **Plan:** select only currently ready Tickets from the dependency graph; decide independent implementation/review roles and necessary count based on this task. No fixed node count, graph topology, Worker count, pinned 26-node G2 graph or new orchestration DSL. Choose a native graph matching the dependency edges and review gates. No production credentials in graph exports.
3. **Allocate:** create/verify isolated Git worktrees from accepted main for each chosen Ticket. Each worker receives Ticket ID, immutable Spec SHA, owned paths, expected RED command/test name, no-private-data instructions, a clear Done packet. Shared files require explicit coordinator ownership; do not let agents edit same file concurrently.
4. **Execute:** workers develop TDD with real authorized coding tools. If using WebChat Browser Harness workers, Trigger once and Collect a stable full result; model response text is advisory until real Git changes are read. An UNKNOWN Send is reconciled against the **same** Attempt via supported read-only Resume/status/collect, never blind retrigger.
5. **Verify:** read actual native n8n execution using n8n_executions (workflowId + executionId + finished=true + status success + node/run/failure counts). A webhook HTTP 200 or model-generated workflow_terminal JSON is not execution proof. Independently inspect worktree Git SHA/diff, run tests and review each Ticket; only Coordinator marks it accepted. Workflow success alone never marks a Ticket PASS.
6. **Integrate:** cherry-pick or rebase approved commits into Coordinator worktree in dependency order, resolve conflicts with new tests, run full suite + GitHub Actions on exact head; no merge/tag/release until Review Gates permit. Update docs for actual implemented differences.
7. **Return:** choose route **before** creating graph: none (default for engineering), first_worker, or bound_origin. For first_worker require exact browser-owned Conversation ID and canonical URL from real first Worker Trigger with matching Collect. For bound_origin use authorized Host candidate list → resolve_targets → read-only collect → exactly one verified origin Identify marker and exact ID/URL; zero/multiple match means unresolved. The Browser return receipt does not prove automatic Planner wake.
8. **Cleanup:** deactivate temporary acceptance Workflow on success/failure; verify inactive and webhook 404 where safe. Retain only sanitized evidence in repository. Real profile, prompt, URL/ID, origin marker, token and execution content stay in private runtime.

## Task graph is chosen from readiness, not predetermined

Example only: the Planner may assign BSV2-002 and BSV2-003 separately after BSV2-001 acceptance; BSV2-006 may proceed concurrently. BSV2-004 waits for 002+003; BSV2-008 waits for 002+003+004+007. A single Ticket may require one worker plus independent reviewer, or a more complex graph. The graph should be optimized for the actual task and discovered node capabilities, never copied from historical G2.

## Evidence contract

**Orchestration receipt (safe):** task-specific Workflow topology summary, workflow/execution IDs, actual native finished and status, node/run/failure counts, selected return mode, cleanup status, sanitized error boundary.

**Coding receipt (safe):** Ticket ID, base and head SHAs, changed file paths, real RED test failure, GREEN test results, GitHub Actions URL and exact SHA, independent review findings, acceptance state.

**Never publish:** real Browser Profile/session, original user prompt, Conversation ID/URL, Identify marker, passwords/tokens, unredacted logs or private response content. Runtime-only correlation identities may be used only inside the authorized execution.

## Failure routing

Classify observed failure as **Skill**, **Native n8n**, **Queqiao-n8n Bridge**, **Browser Harness**, **Coding Host/Git**, **Browser Service**, or **UNKNOWN**. Check native API and code before attributing missing operations to Queqiao. A missing Browser Harness Custom Node Resume option is not permission to assume it exists; discover the actual Runner/extension support first.

Only reproducible Browser Service or Harness code defects justify TDD code changes. Documentation/Skill errors are repaired in the appropriate docs. UNKNOWN has no blind retry or speculative PASS.

## Acceptance for this playbook

The future Coordinator demonstrates one fresh Ticket through: native n8n task graph (when actually required) → authorized worktree write → RED/GREEN → real commit → independent diff/test review → native execution evidence → safe cleanup. A fully observed single Ticket proves the pipeline, not completion of all 11 Tickets.
