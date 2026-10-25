# Issue #22 — authenticated generic ChatGPT long-message post-click diagnosis

Source baseline: merged v0.5.4 commit 9c8f8a388c4986a0f5805a83e65643f574f02ac2.
Patch candidate: v0.5.5-rc.0 on fix/issue-22-long-prompt-expand.
Scope: generic ChatGPT Site Adapter, its regression tests, version metadata and README only. No Paperclip Host, native Skill operations, governance, Core, DB or original Run replay.

## Root cause: folded user bubble, not an absent submission
A fresh *independently authorized* original synthetic 12,482-character actual-website submission using the installed v0.5.4 Site Adapter yielded DISPATCH_AMBIGUOUS/postclick after one click. It had shown a new user bubble about 195ms after click and an assistant message about 517ms after click; the conversation ID path resolved about 2,560ms after click. The composer cleared. The new bubble's text was precisely 10,240 characters, a valid prefix of the original prompt, so the current full-message comparator refused to call it successful.

After closing the original browser session and reopening the same new test conversation *read-only*, the current UI showed a localized "顯示較多" button inside the new user bubble. Clicking this **UI-only expansion** changed its displayed content length from exactly 10,240 to the full 12,482 characters. The entire expanded message matched the synthetic original, including its unique tail marker. The earlier short observed display was NOT proof of actual server-side prompt truncation. This diagnosis proves the cause of this original generic long-prompt reproduction; the independent WEB-33 original Run remains untouched and unaccepted.

The failure is observational: the 5-second window was not the primary cause in this reproduction. Blindly raising the timeout or treating a matching prefix as full confirmation would have weakened the delivery contract.

## Minimal generic Site Adapter change
When and only when a newly added User Turn in the expected conversation does not fully match, and its displayed text is a **proper semantic prefix** of the submitted prompt, the Site Adapter checks for one recognized Show more / 顯示較多 control *inside that new bubble*. It may click that control once and re-read the complete content before applying the original full-message equality. The normal 3–5 second post-click bound, single actual Send, no-overwrite draft rules, same-conversation identity, exact multiline pre-send integrity, cancellation behavior and non-retryable DISPATCH_AMBIGUOUS safeguard are unchanged. A missing control, failed expansion, different complete content, retained composer or click/URL-only proof never returns triggered. Raw prompt/DOM text, credentials, cookies and query tokens are never emitted to diagnostics.

## TDD and build verification
Two new successful long-prompt tests (fresh and resume) were RED against the v0.5.4 implementation; both are GREEN after the single Site Adapter change. Two additional fail-closed cases preserve ambiguous for no expandable control or expanded-text mismatch. Existing short, multiline, click-only, URL-only, replay and draft-ownership tests remain. Local check: 31 files, 157/157 tests, typecheck/build/package import PASS, production npm audit zero vulnerabilities and git diff --check PASS.

## Actual website acceptance (candidate staged production Runner)
Using the independently built staged v0.5.5-rc.0 dist/runner.js with authenticated existing managed Chrome and exclusively original synthetic prompts:
- B1: **long fresh chat**, Trigger triggered; independent Collect completed, exact marker; fresh browser re-open expanded its 10,240-character folded bubble to the entire 12,447-character original, full text and assistant marker match.
- B2: **short follow-up in B1 conversation**, Trigger triggered; independent Collect completed, exact new marker and same conversation identity.
- B3: **short fresh chat**, Trigger triggered; independent Collect completed with exact marker.
- B4: **14,293-character long follow-up in B3 conversation**, Trigger triggered; independent Collect completed, exact different marker and same conversation identity.
- Fresh independent read-only browser launch: B1+B2 and B3+B4 each had exactly two User bubbles and two assistant messages. All four user prompts matched *completely* (expanding B1/B4), all four Assistant markers matched, both composers were empty and both resumed conversation identities were stable.

No ambiguous original dispatch was replayed, no external tools/apps were requested in the synthetic prompts, and no Paperclip state was changed. Private authenticated profiles, raw prompts, full receipts and conversation URLs remain solely in LOCALAPPDATA under Queqiao/harness-browser/acceptance, outside the repository. This document records only non-identifying, nonsecret test metrics.

## Release boundary
This source/Runner acceptance does NOT claim worker-local installation of v0.5.5-rc.0, a v0.5.5 release, main merge, original WEB-33 recovery, Paperclip Native Skill/Done or Recovery acceptance. Complete fresh GitHub Actions PR CI and independent install-level smoke before final closure.