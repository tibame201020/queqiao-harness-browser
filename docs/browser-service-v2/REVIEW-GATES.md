# Browser Service V2 — Engineering Review Gates

Status: required future gates; **not yet executed**.

## D0 — Documentation readiness

- BSV2-001..011 each have exactly one owner, dependency list, RED test, GREEN output, negative cases and Done evidence.
- All public endpoints and codes match OPENAPI.yaml and SPEC.md.
- Worktree baseline is current accepted GitHub main; do not modify an unrelated/diverged local main.
- No private profile state, conversation identity, original prompt, marker, credential or unredacted receipt enters the repository.

## D1 — Per-ticket TDD gate

Run the targeted test and capture a genuine failing RED state on the base; apply the smallest change and show passing GREEN state; rerun relevant regressions. The worker produces a commit and a bounded, sanitized evidence packet. Agent self-report without a commit/diff is not evidence.

## D2 — Coordinator independent review

Review every changed file against spec and owned paths. Require strict client scoping, no duplicate Send, shared-owner locking, restart safety, typed error mapping, negative tests and updated docs. Critique test effectiveness and reject vacuous test doubles. If code or behavior differs from the Spec, raise a spec-change decision rather than silently updating expectations.

## D3 — Integration/CI gate

Integrate reviewed commits in dependency order; independently run project typecheck/test/build/package and API contract tests on integration branch. GitHub Actions must run on proposed PR head. Verify no tracked private runtime files or fixture credentials. A test on another branch/commit is not evidence for the integration SHA.

## D4 — Real HTTP/browser/release gate

Start an independent Service without Queqiao, run fresh synthetic saved Conversation Send + Collect + read-only UNKNOWN reconciliation; independently verify actual observed receipts and one-send ownership. Test a generic HTTP client replacing Pi. No live profile/browser execution without explicit authorization. PR merge/tag/release only after accepted D0–D4.

## Evidence record per ticket

Ticket ID; accepted spec SHA; base/head SHAs; changed paths; RED command/output; GREEN commands/output; review actor and findings; GitHub Actions run identity/status; acceptance PASS/FAIL/BLOCKED/UNKNOWN; sanitized failure category. Treat unknown evidence as NOT VERIFIED.

Historical claim of multiple reviewers ACCEPT applied to earlier ephemeral discussion artifacts, **not** these newly versioned files; no retroactive review proof is inferred.
