# Issue #57 — canonical Project hydration / transient bubble remount (2026-10-30)

## Ownership and historical constraints

The defect is in the **Browser Harness ChatGPT Site Adapter** post-click attribution. It does not change Paperclip CEO/Board/Employee governance, Connected App selection, Queqiao Gateway or the Native MCP contract. The historical SOF CEO Run remains **UNKNOWN and non-replayable**. Its original Host-generated prompt was not recovered byte-for-byte, so do not retroactively declare its saved Conversation to be a verified submitted Run.

## Real observed failure (installed v0.5.9)

- Reported initial Project first Send had canonical first-party saved Conversation route, post-click User bubble counts **0→2→0**, empty Composer, and no attributable new User Turn within the old ~5s window. Harness returned `SEND_OUTCOME_UNKNOWN`; Paperclip correctly rejected the Run.
- An **independent read-only** reopen of that exact saved canonical route later hydrated **0→0→1 User / 1 Assistant**. The saved UUID was present in the originally selected Project list. This proves *delayed React hydration exists* and the old readiness window can miss it, **not** that the unavailable real Host source is exactly what was submitted.
- v0.5.9 extended observation to 12s only if an already verified provisional User Turn or strongly correlated folded preview existed. Thus canonical saved route + empty Composer + still-absent message expired at ~5s. The early transient 2 bubble candidates cannot safely be interpreted as two actual persisted turns or as success.

## Deterministic TDD

- New synthetic first-Project fixture: pre-click original Project, one Send, provisional route, canonical Project alias at poll 2, React User bubble counts `0→2→0→1` with **only the later unique exact User Turn**. 0.5.9 **RED**: `DISPATCH_AMBIGUOUS` at 5s, `before=0,max=2,current=0`, no saved attribution.
- New correction **GREEN**: canonical first-party Project route with a server-format UUID, pre-click first Project identity, **baseline 0** and empty Composer may use the existing **12s observation-only ceiling**. This does not grant success, prevent UNKNOWN or send again.
- If any transient 2+ bubble count was observed (including in provisional route), final success also needs a **separate read-only canonical saved Conversation tab** with exactly **one unique outermost full-text User source match**, rechecked after a 600ms stabilization dwell. Original Project membership is additionally required **even if the canonical Project route ID matches**. A 2-bubble observation by itself is not proof of multiple persisted turns, but demands stronger proof.
- The normal positive evidence remains: one attributable new User Turn at the end of hydration, complete prompt match, empty Composer, stable state, canonical saved UUID, and original first-party Project membership when route aliases or transient 2 bubbles occur. **Never accept solely canonical UUID, Assistant response, first-party Project label or membership.**
- New negative synthetic cases: two *persisted* distinct User Turns in readback, wrong persisted text, absent membership, wrong saved ID, wrong submitted source, nonempty Composer, permanently missing final User Turn, and wrong origin all stay `DISPATCH_AMBIGUOUS` and non-retryable. No prior UNKNOWN attempt unlocked.
- Added count/boolean-only hydration evidence: canonical-candidate, transient multiple seen, empty after multiple, saved-unique-Turn proof, observation extension. No prompt content, DOM or real IDs added to tracked files.

## Verification

- RED before patch; after patch **9/9 Issue #57 tests GREEN**, full Windows **276/276** (35 files), TS typecheck, build/package import/stateless Runner and production audit all PASS.
- Built candidate **0.5.10** with distinct private synthetic Chrome/CDP Profile: fresh **7,100-character Project first Send** returned `triggered/submitted` and canonical UUID; `collect/completed` returned exactly the marker and same UUID.
- Independent read-only reopen found **1 saved User, 1 Assistant**, **exact full 7,100-character synthetic source**, exact reply marker, canonical URL equal to receipt, and unique saved Conversation ID in the original Project list.
- The real browser may or may not exhibit the artificial 0→2→0→1 transient in any particular fresh run. The **controlled deterministic fault injection** verifies the remount handling; the **live synthetic E2E** verifies browser interoperability. Do not conflate them.

## Release gate and separation

Exact-commit GitHub Actions PASS; staged local Windows+WSL package from merged main; installed-Extension fresh Project Trigger/Collect and independent readback; GitHub Release separately verified. Public npm Trusted Publishing remains Issue #46. Original SOF CEO Run stays UNKNOWN. No user/account/browser private data in repository.
