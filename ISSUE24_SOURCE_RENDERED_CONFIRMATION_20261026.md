# Issue #24 — source vs. rendered post-click confirmation (2026-10-26)

## Root cause and product boundary

This PR follows the specific 2026-10-26 Issue #24 comment, `#issuecomment-6406420097`. Three independently original Paperclip E2E Runs (WEB-39/40/41, **not retries**) showed raw and whitespace-normalized Adapter→Host prompt SHA-256 equality, yet real ChatGPT HTML rendered code blocks different from the original source Markdown: WEB-40 Host normalized 9,698 vs site 9,686 (12 fewer), common prefix 378 / suffix 8,327; WEB-41 9,184 vs 9,172 (12 fewer), prefix 376 / suffix 7,942. The respective User messages and answers existed on the site, but the old Harness imposed normalized rendered-text == source-text as a hard submission prerequisite and returned non-retryable ambiguous.

The Markdown render is not an original-source serialization. The owned click, exact presend editor reconstruction, correct conversation, new User Turn, and settled empty composer must be verified independently of source/rendered equality. A click/URL or response alone remains insufficient.

## Bounded generic Harness repair

- Retain exact normalized source-to-rendered text matching as the primary path.
- Only for **exactly one newly added User Turn** in the expected conversation, allow a second, conservative structured-render proof if the message contains a real `pre code` node; the rendered text and originally validated source must have a normalized length gap of no more than 2% (minimum allowance 24 characters), matching leading and trailing spans of at least 64 characters each, and matching prefix+suffix covering at least 85% of the full source/rendered length. This does **not** attempt to reconstruct source from HTML and can deliberately remain ambiguous for unsupported multi-region transformations.
- The original editor must have passed the strict presend source integrity contract and Send actionability checks. Require exactly one actual Send, correct conversation ID, precisely one new User Turn, stable empty composer, unchanged 3–5-second post-click settlement and non-retryable ambiguous if the proof is insufficient.
- Retain existing Show more expansion only inside that new bubble, no blind resend, no overwriting existing drafts, no other Provider or Paperclip changes. No raw message, content fragment, actual conversation URL or session data in repo/diagnostics.

## TDD and actual authenticated ChatGPT evidence

- Four new formatted-source test permutations: **new and resumed formatted message success** were RED on original `0.5.5-rc.1` and GREEN after the localized predicate correction; **unformatted DOM / altered tail** remain ambiguous. One extra concurrent-turn negative test enforces exactly one newly attributable User Turn.
- Full local check: **168/168 tests, 31 files**, TypeScript/build/package import PASS; production npm audit zero vulnerabilities; diff check PASS.
- Isolated candidate `0.5.5-rc.2` staged production Runner (no installed Worker change), new original synthetic G2: 11,819 source characters, normalized source 11,752 / normalized rendered 11,740 (**12 fewer**), one `pre code`, common prefix 510 and common suffix 9,609 (coverage 86.10%), Trigger `triggered`, independent Collect `completed`, exact marker. On independent read-only reopen, complete UI text mismatch was verified (not a synthetic mock-only assertion).
- A second distinct **resumed** message G3 sent to the same ChatGPT Conversation ID: original source 9,611, normalized source 9,540 / rendered 9,528 (**12 fewer**), one `pre code`, common prefix 570 / suffix 7,649 (coverage 86.15%), Trigger `triggered`, independent Collect `completed`, exact new marker. Read-only reopen found exactly two User bubbles, two Assistant responses, both markers exact, empty composer and unchanged conversation ID.
- A preliminary original G1 with tilde fences rendered source==site and had zero code-block nodes. This was explicitly **excluded** from the Markdown-delta root-cause acceptance evidence.

## Release and remaining gates

This source candidate is not a claim that archived WEB-33–41 have been repaired; none were replayed, cleared or modified. It is **not** a completed Paperclip Native E2E. A NEW isolated, original Paperclip Head Run must still prove native `list_skills`, each actual official Skill part in order, >9 same-conversation turns and proper Issue Done/Comment attribution, followed by installed-extension acceptance, before Issue #24 can be closed. Paperclip Host/Core and formal company state are out of scope.

Keep this PR Draft pending GitHub Actions and the independent Paperclip/installed-Runtime acceptance. Windows and WSL production Workers currently remain at `0.5.5-rc.1`. No Tag, GitHub Release, npm publish or upgrade is part of this candidate.
