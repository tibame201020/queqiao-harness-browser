# Browser Harness v0.5.5 — Release Notes

Release scope: stabilization and approved V2 conversation routing since the previous GitHub release `v0.5.2`.

## Changes

- **ChatGPT first-Send / Resume hardening:** bounded Send confirmation, robust rendered-message handling, read-only reconciliation of ambiguous initial Sends, and explicit challenge/unavailable handling. No blind retry of uncertain sends.
- **Conversation return targets:** opt-in per-run `conversationId` and `conversationUrl` destination for `trigger`. Supports both standard conversations and canonical ChatGPT Project URLs; verifies the exact destination before and after Send, failing closed on mismatches.
- **Read-only target discovery:** ChatGPT adapter `resolve_targets({urls})` validates bounded canonical URL candidates and returns Conversation ID/URL pairs. Runner resolves these **without a Browser Session, page navigation, or mutable state**.
- **Compatibility:** existing `collect`, profile configuration, and provider abstractions remain intact; dynamic target override remains opt-in.

## Verification

- TDD regression: **219 tests** plus type checking, production build, package import, and stateless offline-CDP Runner subprocess acceptance.
- CI in `.github/workflows/ci.yml` checks runtime tests and the production dependency audit.
- Queqiao-n8n V2 local integration: actual Execution **#19** completed 14/14 A→B→A nodes, and actual Execution **#20** completed 3/3 native `resolve_targets` nodes with standard/Project synthetic candidates. Both temporary Webhooks were deactivated.
- **Not claimed:** original Planner `bound_origin` (G2) production acceptance or automatic awakening of a ChatGPT conversation. That is a separate test using a new initiating conversation.

## Release contract

GitHub Tag `v0.5.5`, `package.json.version=0.5.5`, Queqiao manifest `version=0.5.5`, and npm package version must agree. GitHub Actions `Publish npm` begins only after the GitHub Release is published. If npm requires staged approval, the GitHub Release is not proof the npm registry accepted `0.5.5`.

No user Conversation ID, private URL, text content, cookies, login profile, or API credential is included in this release note or repository.
