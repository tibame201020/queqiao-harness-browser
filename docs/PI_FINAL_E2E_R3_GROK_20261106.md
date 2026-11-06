# Pi Web Ask — Final E2E Round 3/4: Grok (2026-11-06)

## Verdict

**PASS — both installed WSL Pi and Windows Pi** completed a mandatory Grok consultation that correctly incorporated the synthetic local ProjectTag. The expected answer was *not* included in the originating user prompt: Pi first read the local synthetic fixture and supplied the actual ProjectTag and Goal as Web Ask context. Grok returned the exact ProjectTag. Both private durable receipts independently proved `COMPLETED` with the provider-specific UI terminal-action evidence, not just text stability.

This round used the pre-existing pinned Grok tab, the shared Orca lock and the existing Pi Agent Loop. No real project content, credentials or personal data were sent to Grok or committed to the repository. No other provider, tab or repository was modified. Round 4/4 Mistral has **NOT_ATTEMPTED** status.

## Real Pi E2E observations

| Platform / test | Actual Pi tool calls and outcome | Job ID | Verdict |
|---|---|---|---|
| WSL local-only `/ask-grok` | `read`×1; `ask_grok`×0; local synthetic ProjectTag reported; agent exited | `c126fc46-debd-4d34-aaf9-e2fa9c9b1ef4` | PASS |
| Windows local-only `/ask-grok` | `read`×1; `ask_grok`×0; local synthetic ProjectTag reported; agent exited | `7281138c-abdb-425e-b17c-3125a4a55308` | PASS |
| WSL forced consultation, initial version | `read`×1 → `ask_grok`×1 → `NOT_SENT / PROMPT_INTEGRITY_FAILED`, **before** Enter, no message sent | `b41c5fbf-6a8c-41d5-9fe9-b2c4d65dad04` | FAIL, retained |
| WSL forced after TDD repair | `read`×1 → `ask_grok`×1 `PENDING` → `collect_grok`×1 `COMPLETED`; exact file-derived ProjectTag and normal agent exit | `da156826-4674-454e-9138-76c0197a869a` | PASS (14.2 s) |
| Windows forced after TDD repair | `read`×1 → `ask_grok`×1 `PENDING` → `collect_grok`×2 (`PENDING`, then `COMPLETED`), status read in between; exact file-derived ProjectTag and normal agent exit | `dcc5891c-e3d5-4cb8-aeae-124a212158ab` | PASS (14.6 s) |

The tests use **different** synthetic ProjectTag values for Windows and WSL. Each mandatory test required a genuine read of its corresponding local fixture before any external Ask. The E2E driver rejected an unrequested external Ask in local-only mode, a repeated Ask in mandatory mode, an absent/incorrect ProjectTag, an imprecise remote answer or an agent that did not terminate normally.

## Retro: Grok multiline editor integrity

The first WSL mandatory test exposed a *pre-send false negative*, not lost data. The actual Grok editor contained four `<p>` nodes. The intended prompt was **265 characters**, but its browser `innerText` included three extra visual newlines (**268 characters**). Replacing the visual paragraph boundaries with logical newlines yielded exactly the same SHA-256 hash as the original durable request's `prompt_hash`. The original request was explicitly `NOT_SENT`; no Enter or Click was performed.

A minimal fix in `pi/web-providers.mjs` reuses the narrowly scoped paragraph reconstruction already verified for Claude, now for **Grok and Claude only**. It preserves nested inline text and intentional empty paragraphs, then joins paragraph text with logical newline separators. It does **not** relax the original strict prompt equality check or hash verification. ChatGPT and Mistral extraction paths are untouched.

Two new Node tests were written **before** changing the implementation and demonstrated RED; the tests then passed GREEN after the fix. The failed synthetic draft was cleared **only after** its reconstructed text's SHA-256 matched the original failed receipt, with `userCount=0` and no generation. The original `NOT_SENT` receipt remains intact; the successful E2Es used **fresh synthetic questions**. During cleanup, all original Orca Page IDs, URLs for other tabs, and the pinned Grok page URL remained unchanged.

## Independent journal and resource checks

Each final successful private journal contained precisely one matching `COMPLETED` result with exact file-derived ProjectTag, valid SHA-256 prompt hash, canonical Grok conversation binding and `completion_evidence=latest-assistant-terminal-action-v1`.

Both platforms had **zero relevant Pi E2E processes remaining** after the run and the shared Orca lock was released. These are short-run cleanup observations, not a long-duration leak test.

The four-provider completion POC previously observed that Grok's **Copy** action may appear before the last response character; this implementation uses latest-response **Regenerate** evidence instead. Therefore neither an early Copy control nor temporarily stable text is accepted by itself as proof of terminal completion.

## Engineering status and remaining boundaries

- WSL `npm run check`: 42/42 Vitest files and **89/89 Pi Node tests PASS**; Windows native **89/89 Pi tests PASS** after install. Latest commit's GitHub Actions should be read independently before claiming CI completion.
- This round changes the shared provider extraction module and its two new unit tests, plus these documents. It does not introduce another orchestration layer or alter Pi's built-in model loop.
- A later Grok UI DOM/toolbar change could cause `PENDING` or `NOT_SENT` rather than successful completion; fail closed, inspect the actual current DOM and re-run TDD rather than loosening checks.
- The local Pi model may still omit important context on other instructions; the acceptance evidence here is for the observed strict-context calls, not an unconditional reliability guarantee.
- Draft PR #81 remains **unmerged and unpublished**. Mistral final Round 4 is still outstanding.
