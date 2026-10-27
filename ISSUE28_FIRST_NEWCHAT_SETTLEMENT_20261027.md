# Issue #28 — bounded first-new-chat Send settlement (2026-10-27)

## Original evidence and root cause

- Installed `0.5.5-rc.3` independently recorded WEB-56 (original Run `84c2138b-186f-4158-a3f0-c8d085e4fd00`) and WEB-58 (original Run `fc17ad65-2057-47ed-b39e-d257a535ee28`) **first new-chat Sends** as `SEND_OUTCOME_UNKNOWN`, `postClickReason=stabilizing`, `sameTarget=false`, `submissionConfirmed=true`, `composerSettled=true`, one dispatch attempt each. Subsequent read-only inspection independently showed exactly one User Turn and one Assistant answer in each original ChatGPT conversation. Original native operations were **not** published; these Runs/Issues stay failed/blocked with untouched receipts.
- Source tracing: prior to Send the owned ChatGPT draft has no saved Conversation ID; the first owned Send creates a `/c/{id}` URL. Generic `inspect().sameTarget` uses strict `current.id===initialId` which is suitable **before Send** but *not* for reporting the expected first-chat URL creation. The actual post-click `targetValid` already correctly accepts first-chat null→saved-ID and continues to require the correct origin and expected ID for resumes. This is a misleading **diagnostic**, not the actual rejection gate.
- The actual outcome gate `awaitPostClickSettlement` required at least 600ms continuous observable correct-User-Turn + empty-composer settlement, but unconditionally threw at 5 seconds **even when that strong proof appeared near the deadline**. A time-controlled new-first-chat test with correct saved-chat navigation and delayed rendering confirmed old code RED (`ambiguous / unknown`), then fixed code GREEN.

## Minimal fix and boundaries

- Keep all pre-click targeting **strict**, editor integrity complete, no unrelated draft override, one owned Send, exactly one new attributable User Turn in correct authenticated Browser Session, correct complete prompt content (incl inline-code/fenced structured proof), settled empty composer, no automatic retry.
- Report `sameTarget=targetValid` **only for post-click** state, so first-chat navigation is correctly described; resumes still require the previously specified expected conversation ID.
- Preserve initial post-click maximum 5,000ms. If, **before this deadline**, correct new User Turn content and settled empty composer have **both** already been observed in the correct target, allow up to 1,500ms extra **only to finish the 600ms continuous stability dwell**. If any proof disappears, wrong origin or target, absent/doubled User Turn, changed text, unproven inline code, or nonempty editor, no grace is granted. All unverified post-click outcomes remain `ambiguous / submissionState=unknown / retryable=false`; pre-click failures remain `unavailable / not_sent`.
- No fuzzy prompt tolerance, no arbitrary sleeps, no unconditional post-click timeout expansion, no user content/URL/secrets in Git. Existing one-click replay guard, Website Adapter abstraction and Paperclip-native responsibilities are untouched.

## TDD / acceptance

- New deterministic late-User-Turn first-chat test: **RED on merged rc.3**, GREEN on rc.4.
- Negative cases: wrong browser origin, absent new turn, changed plain-text content, multiple new turns, nonempty composer; wrong resumed saved Conversation ID; existing unrelated draft. None may invoke an extra Send or accept wrong content. Prior tests also cover altered/missing inline-code DOM, folded text and wrong formatted content.
- Required before release/merge: fresh unit/typecheck/build/package import and npm production audit, GitHub Actions exact-HEAD CI; new original noncommercial authenticated ChatGPT **installed Windows Extension** first Trigger+Collect with independent read-only reopening and new isolated Paperclip Child Done / auto-woken CEO Parent Done+Comment in their original Runs; independent Windows/WSL installed build. All WEB-54/56/57/58 originals must remain immutable and never be replayed.
- Version candidate: `0.5.5-rc.4`. No release, merge or production update is implied by this engineering document alone.
