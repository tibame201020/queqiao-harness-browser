# Issue #24 — source vs. rendered post-click confirmation (2026-10-26)

## Root cause and product boundary

This PR follows the specific 2026-10-26 Issue #24 comment, `#issuecomment-6406420097`. Three independently original Paperclip E2E Runs (WEB-39/40/41, **not retries**) showed raw and whitespace-normalized Adapter→Host prompt SHA-256 equality, yet real ChatGPT HTML rendered code blocks different from the original source Markdown: WEB-40 Host normalized 9,698 vs site 9,686 (12 fewer), common prefix 378 / suffix 8,327; WEB-41 9,184 vs 9,172 (12 fewer), prefix 376 / suffix 7,942. The respective User messages and answers existed on the site, but the old Harness imposed normalized rendered-text == source-text as a hard submission prerequisite and returned non-retryable ambiguous.

The Markdown render is not an original-source serialization. The owned click, exact presend editor reconstruction, correct conversation, new User Turn, and settled empty composer must be verified independently of source/rendered equality. A click/URL or response alone remains insufficient.

## Bounded generic Harness repair

- Retain exact normalized source-to-rendered text matching as the primary path.
- Only for **exactly one newly added User Turn** in the expected conversation, allow a second, conservative structured-render proof if the message contains a real `pre code` node; the full rendered text must be an **ordered subsequence of the exactly validated source**, with only **1–24 source characters omitted**, no substitutions or insertions, and matching leading and trailing spans of at least 64 characters each. The pre-merge review rejected the earlier 85%-context heuristic as unsafe because it could accept an altered middle segment. This does **not** attempt to reconstruct source from HTML and can deliberately remain ambiguous for unsupported multi-region transformations.
- The original editor must have passed the strict presend source integrity contract and Send actionability checks. Require exactly one actual Send, correct conversation ID, precisely one new User Turn, stable empty composer, unchanged 3–5-second post-click settlement and non-retryable ambiguous if the proof is insufficient.
- Retain existing Show more expansion only inside that new bubble, no blind resend, no overwriting existing drafts, no other Provider or Paperclip changes. No raw message, content fragment, actual conversation URL or session data in repo/diagnostics.

## TDD and actual authenticated ChatGPT evidence

- Four new formatted-source test permutations: **new and resumed formatted message success** were RED on original `0.5.5-rc.1` and GREEN after the localized predicate correction; **unformatted DOM / altered tail** remain ambiguous. One extra concurrent-turn negative test enforces exactly one newly attributable User Turn. A pre-merge security regression also demonstrated RED for a same-length *substituted middle* that the earlier 85% threshold incorrectly accepted; the bounded deletion-only predicate made it GREEN/fail-closed. The two original authenticated G2/G3 full rendered texts were independently re-read and confirmed to be ordered source subsequences with exactly 12 source-only omissions each.
- Full local check: **169/169 tests, 31 files**, TypeScript/build/package import PASS; production npm audit zero vulnerabilities; diff check PASS.
- Isolated candidate `0.5.5-rc.2` staged production Runner (no installed Worker change), new original synthetic G2: 11,819 source characters, normalized source 11,752 / normalized rendered 11,740 (**12 fewer**), one `pre code`, common prefix 510 and common suffix 9,609 (coverage 86.10%), Trigger `triggered`, independent Collect `completed`, exact marker. On independent read-only reopen, complete UI text mismatch was verified (not a synthetic mock-only assertion).
- A second distinct **resumed** message G3 sent to the same ChatGPT Conversation ID: original source 9,611, normalized source 9,540 / rendered 9,528 (**12 fewer**), one `pre code`, common prefix 570 / suffix 7,649 (coverage 86.15%), Trigger `triggered`, independent Collect `completed`, exact new marker. Read-only reopen found exactly two User bubbles, two Assistant responses, both markers exact, empty composer and unchanged conversation ID.
- A preliminary original G1 with tilde fences rendered source==site and had zero code-block nodes. This was explicitly **excluded** from the Markdown-delta root-cause acceptance evidence.

## Pre-merge security review and stricter original acceptance

- An adversarial single-middle-substitution test was RED against the first Draft PR's 85% prefix/suffix similarity predicate: changed, same-length message content could incorrectly produce `triggered`. This was corrected **before merge or installation**.
- The candidate now only correlates the full formatted rendered message if it is an **ordered subsequence** of the original validated source with **1–24 source-only omissions**, zero added or substituted characters and at least 64-character identical prefix/suffix. The real G2/G3 independent readback data was rechecked under this precise predicate: both were deletion-only, exactly 12 source characters omitted.
- TDD RED→GREEN for the substituted-middle case; total **169/169 tests**. Unrelated content, altered tail, multiple new User Turns, URL-only, click-only, empty editor/draft, unsupported formatter proof remain fail-closed.
- Another *new original* production staged `0.5.5-rc.2` G4 prompt was sent **after** this stricter change. Trigger=`triggered`, independent Collect=`completed`, one Send and the correct unique response marker. A closed-and-reopened read-only Browser check found 12,081 source characters, normalized source 12,014 versus rendered 12,002 (12 fewer), exactly one `pre code` DOM node, rendered text was an ordered source subsequence with exactly 12 omissions, one User and Assistant turn, empty composer. All private receipts and ChatGPT URL stayed outside git.


## Release and remaining gates

This source candidate is not a claim that archived WEB-33–41 have been repaired; none were replayed, cleared or modified. It is **not** a completed Paperclip Native E2E. A NEW isolated, original Paperclip Head Run must still prove native `list_skills`, each actual official Skill part in order, >9 same-conversation turns and proper Issue Done/Comment attribution, followed by installed-extension acceptance, before Issue #24 can be closed. Paperclip Host/Core and formal company state are out of scope.

Keep this PR Draft pending GitHub Actions and the independent Paperclip/installed-Runtime acceptance. Windows and WSL production Workers currently remain at `0.5.5-rc.1`. No Tag, GitHub Release, npm publish or upgrade is part of this candidate.
