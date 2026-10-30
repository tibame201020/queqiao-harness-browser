# Issue #68 — transient Composer focus retry (2026-10-30)

## Confirmed boundary
The v0.5.14 ChatGPT adapter retries failed editor text reads (Issue #66), but after a verified empty editor it calls `composer.click({timeout:3000})` once. Any thrown click exception directly produces `PRE_SEND_NOT_READY/composer_click_failed` **before text insertion, original SendAttempt, or Send click**. In the real v0.5.14 native CEO Run the post-failure diagnostic showed the composer missing, elapsed 3842ms, same target, no generation. The Playwright exception was not persisted: a React remount or detached editor is a hypothesis, NOT a confirmed subtype.

## Minimal correction
Re-observe the **same original saved Conversation** and reacquire the current live Composer following a focus exception. Retry focus within the **existing 15-second precompose window**, calling the already-existing `readLiveDraft()` before each attempt. That function verifies same target, no active generation, exactly one visible/editable editor and both editor text reads; a real external draft immediately aborts. It does not assume an unreadable editor is empty. Once focus succeeds, the original post-focus draft recheck, one text insertion, readiness validation, and one original Send click remain unchanged. No governance, approvals, named rounds, additional retries after Send, or Provider changes.

## TDD evidence
- RED→GREEN: one failed focus with temporary zero matching editors; reacquire and focus the new live editor, original Attempt callback once, one text insertion and one Send click.
- Negative: actual draft appears following failed focus -> `draft_present/not_sent`; wrong Conversation -> `not_sent`; persistent focus click errors -> `composer_click_failed/not_sent`; generation becomes active -> `not_sent`. In all negative cases no Send click.
- Windows `npm run check`: 311/311 PASS (39 files), TypeScript, build, package import and stateless Runner PASS.
- Further CI, WSL and installed Extension evidence must be verified independently. A synthetic Browser continuity test does not prove a real Paperclip CEO→Employee assignment.
- No private identifiers, company prompts or account data placed in repository.

## Distribution
GitHub Release, Windows/WSL local extension and public npm version have independent statuses. Existing npm trusted-publishing Issue #46 is outside #68.
