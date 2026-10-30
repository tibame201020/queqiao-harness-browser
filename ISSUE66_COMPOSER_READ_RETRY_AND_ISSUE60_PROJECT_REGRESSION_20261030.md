# Issue #66 — Composer read retry and #60 first Project Send regression evidence (2026-10-30)

## Scope / product ownership

Browser Harness ChatGPT adapter. No Paperclip governance, policy, approval, agent or Provider changes. Original Send remains a single click; ambiguity remains read-only. A real draft must not be overwritten.

## #66 CONFIRMED root cause

The v0.5.13 `sendChatGptPrompt()` precompose readiness predicate first verified correct target, no generation and exactly one visible editable Composer. It then called `innerText()` and `textContent()` concurrently and **immediately** classified a single rejected browser read as `editor_read_failed`, returning `PRE_SEND_NOT_READY` without retry, even though only about 617 ms of the existing 15-second readiness window had passed.

Actual Issue #66 native Host evidence: `sameTarget=true`, `generationActive=false`, `composerMatches=1`, visible/editable, `precomposeReason=editor_read_failed`, no text insertion or new Send. The underlying exception (React remount versus detachment, etc.) was *not captured* and is UNKNOWN.

### Minimal correction

Within the same existing 15-second precompose window, reacquire `inspect()` and the live Composer locator after failed read. Read `innerText({timeout:1000})` and `textContent({timeout:1000})` again without dispatch. Reuse the same read function **before focus and after focus**. A confirmed nonempty draft immediately returns `draft_present`; repeated failures return `editor_read_failed` when the original deadline expires. No blank draft assumption, extra Send or new approval layer.

### TDD / actual Chrome/CDP

RED on v0.5.13: single synthetic transient `innerText()` failure returns unavailable pre-Send; after-focus transient also returns unavailable. GREEN: transient `innerText()`, transient `textContent()`, after-focus transient all reach **exactly one** Send; a real draft appearing after an exception is not overwritten; permanently unreadable Composer remains `not_sent`, with **no Send**. Full Windows check 306/306 tests PASS (39 files), TS/build/package import/stateless Runner PASS, production audit zero vulnerabilities.

Candidate compiled Runner used the actual authenticated Chrome/CDP session for **two consecutive synthetic turns** in one already-saved original Project Conversation: `identity` then `company`, both `triggered/submitted → collect/completed`, exact replies and same Conversation UUID. This verifies the real ordinary continuation path; a fault-injected transient DOM error is proven by deterministic tests, not falsely claimed to have occurred during live website usage.

## #60: separately verified first-Project Send regression evidence

Actual historic first-Project issue evidence: Browser Harness 0.5.13 after an original Project first click recorded **User bubbles 0→2**, `sameTarget=false`, `postClickReason=target_unconfirmed`, `SEND_OUTCOME_UNKNOWN`. Original Attempt recorded original Project identity and prompt, but **no observed canonical saved Conversation URL**. Thus the implemented #60 read-only Resume could not locate the exact saved original Conversation. There is no proof of an additional persisted saved User turn from that failed Run. Its exact intermediate browser route and site transition are UNKNOWN (the Host diagnostic does not contain the URL), so do not invent the cause or retry the unknown Attempt.

Git diff `v0.5.11..v0.5.13` shows #63 changed the **existing saved-Conversation** message-ID reconciliation and its original Project pre-click route handling, but did not change the first-Project `strictTarget` / provisional / saved Project attribution conditions in `awaitPostClickSettlement`. Therefore there is **no code evidence** that the #63 changes caused a new #60 regression; the observed historical failure is a still-unattributed first-Project saved-route observation, not proof of a general regression.

A fresh **single-click** synthetic first Project Send using this #66 candidate and the actual authenticated Chrome/CDP returned `triggered/submitted`, a saved Conversation UUID, and after a second **read-only Collect** (the first returned pending) produced the exact expected response. No duplicate Send. That establishes the current first-Project path can succeed, **not** that all observed alias/hydration transitions are resolved.

## Acceptance boundaries

Do not treat synthetic Browser tests as Paperclip CEO→Employee native assignment acceptance. No credentials, original native prompts, private Project URLs or native Run IDs in the repo. CI and local Extension installation must be checked separately. Public npm trusted publishing remains Issue #46.
