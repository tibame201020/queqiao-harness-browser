# Issue #20 — historical precompose candidate (superseded, 2026-10-23)

**Superseded:** subsequent WEB-32 Live evidence disproved waiting for a pre-send draft to clear as a sufficient remedy. See `ISSUE20_POSTCLICK_SETTLEMENT_ACCEPTANCE_20261023.md` for the current candidate; the facts below record only the old candidate and must not be read as its acceptance.

Status: **source regression PASS; authenticated Live multi-turn E2E NOT YET ACCEPTED**. This is an isolated candidate based on #18 merged main `b5bcca1e69ecbf90dbb0d6057dff1f528508fc48`, not a production release or a claim that WEB-31 was recovered.

## Scope
- `precomposeReason` is a bounded enum: `draft_present`, `editor_read_failed`, `composer_click_failed`, or null. Never emit prompt, editor content, DOM, cookies or credentials.
- Wait up to the existing bounded precompose deadline for an editor to clear **naturally**; never clear or overwrite a persistent independent draft.
- Double-check editor emptiness via rendered and raw text; re-check same target, generation state and editor emptiness after focus before inserting. Keep #18 semantic full-text integrity and #16 trial Send/actionability/ambiguous result protections.
- No Paperclip-specific site logic; no Multi-provider changes.
- Candidate version `0.5.4-rc.0`, not tagged or published.

## Verification actually performed
- Base exact merged source 0.5.3: `npm run check` **141/141**, typecheck, build, package import PASS.
- New #20 tests: transient editor clears, persistent draft rejected, click failure classified, racing focus draft rejected, editor read failure rejected. `npm run check` **146/146**, typecheck, build and package import PASS.
- `npm run dev:stage` created unique Windows candidate path `queqiao-harness-local-053/.local-install/0.5.4-rc.0-1792738749334-34936`.
- The 0.5.3 already-deployed authenticated #18 initial multiline Trigger/Collect was previously verified; #20 candidate must not inherit this PASS.
- Prior failed WEB-29/30/31 receipts must not be replayed; fresh Paperclip Issue/Run and final native author/Run readback remain required.

Do not merge or release based solely on this source acceptance.