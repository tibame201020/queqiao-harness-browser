# Browser Service V2 — Engineering handoff

Status: **documentation baseline, not implemented**. 2026-10-29.

## Read in this order

1. [SPEC.md](SPEC.md): product scope, domain invariants, operation lifecycle, security.
2. [OPENAPI.yaml](OPENAPI.yaml): proposed HTTP wire contract (design only, no server currently implements it).
3. [TICKETS.md](TICKETS.md): BSV2-001..011, dependencies, owned paths and RED→GREEN gates.
4. [ORCHESTRATION.md](ORCHESTRATION.md): how to drive ticket work via installed Queqiao-n8n orchestration Skills.
5. [REVIEW-GATES.md](REVIEW-GATES.md): independent code review and CI/E2E evidence.
6. [GLOSSARY.md](GLOSSARY.md) and [ADR-0001.md](ADR-0001.md): stable terms and architectural rationale.

Authority: explicit user decisions → SPEC → OPENAPI wire contract → Tickets → existing code evidence. Conflicts are a spec blocker and require a reviewable documentation change before the affected ticket can run.

Browser Service is a standalone HTTP API server; Browser Harness is its initial **internal** backend. Queqiao, Pi, Paperclip and n8n are optional consumers/infrastructure. They must not become mandatory service dependencies.

These documents live temporarily beside the Harness source to allow incremental engineering and review. This is not a decision that the final service must be a Queqiao Worker extension. There is no pre-designed n8n Workflow graph and no prescribed Worker count.

Every ticket needs actual Git change/test/CI evidence. No profile data, credentials, real conversation URL/ID, marker, original prompt, or private response belongs in Git or GitHub Actions artifacts.

**No implementation/release claims** are implied by this documentation commit.
