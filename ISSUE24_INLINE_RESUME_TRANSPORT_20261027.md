# Issue #24 — inline-code resumed transport proof (2026-10-27)

## Scope based on CURRENT Issue requirements
- The generic Browser Harness owns single-click Browser Send transport, **not** Paperclip Skill-reading policy, model correctness, or the native Done publication.
- Installed rc.2 WEB-42/43/44/47 evidence: original resumed turns may be visibly sent and answered but returned `PRE_SEND_NOT_READY`, `message_unavailable` or `expanded_text_mismatch`. WEB-47 read-only: 3 User + 3 Assistant turns, 54 inline-code nodes, **zero** `pre code` nodes; actual Native list and requested first Skill part executed, but genuine Native Done refused while Host dispatch was unconfirmed.
- WEB-45/46 genuine native Done acceptance was independently verified; no compulsory whole-Skill read is a Harness contract. Do not replay or rewrite any WEB-33–47 original Run/receipt.

## Minimal generic site adapter change
- Pre-click: exact intended Prompt reconstruction in contenteditable, correct expected Conversation/URL, one owned Send action, unrelated drafts protected. Same pre-send timeout and readiness contract.
- Post-click: correct conversation, **exactly one newly added User Turn**, settled empty editor, existing bounded observation and no blind resend. Exact normalized rendered text equality remains preferred; existing conservative `pre code` deletion-only proof is unchanged.
- NEW strict inline-code proof when `pre code` is unavailable: source must contain ONLY unambiguous paired **single-backtick** spans, with no triple fences or unmatched backticks; there must be the same positive number of actual inline `code:not(pre code)` elements; **every code element content must equal the corresponding original source token in order**; and the **entire** bubble text must equal the original source after removing precisely those inline Markdown delimiters and performing the existing whitespace normalization. No generic similarity threshold or arbitrary deletion/substitution.
- ChatGPT trigger result keeps existing `triggered` / `unavailable` / `ambiguous` statuses and adds explicit `submissionState` = `submitted` / `not_sent` / `unknown`. `not_sent` is reserved for verified pre-Send failures; all post-click uncertainty remains `unknown`, `retryable:false`. The generic Runner replay guard remains unchanged.
- This is **not** a read-only recovery mechanism and cannot retrospectively clear an ambiguous Run. The independent WEB-42 `PRE_SEND_NOT_READY` remains a separate observable gate.

## TDD and authenticated isolated ChatGPT site acceptance
- RED on rc.2: both fresh and same-conversation resumed inline-code-heavy new User Turn simulations were rejected despite valid source-to-render transformation. GREEN after strict matching; negative tests with modified trailing content, altered inline code element content and missing inline DOM remain non-retryable ambiguous, one Send only. Additional not_sent/no-click and unknown/post-click receipt test.
- Candidate **0.5.5-rc.3**, original isolated and noncommercial synthetic H1 fresh: 7,326 source chars with **54** single-backtick code spans, `triggered` + `submissionState=submitted`, separate `collect=completed`, exact unique response marker.
- Original distinct H2 resumed into exact H1 conversation: 6,982 source chars with **54** code spans, `triggered/submitted`, independent `collect=completed`, separate exact marker and unchanged Conversation ID.
- Both Browser sessions closed; independent **read-only** reopening confirmed exactly 2 User / 2 Assistant turns, empty composer, both reply markers exact. Both User messages had exactly **54 actual inline-code DOM nodes**, whose values matched the 54 source token values one by one. The site's visual strings were 7,218 / 6,874 characters (**108 fewer** each than respective original sources, due to removed code delimiters), and after only those delimiter removals, the complete rendered text matched its expected source. No `pre code` fallback was needed.
- Detailed prompt/URL, original synthetic content, receipts and managed Chrome credentials remain in local private Harness acceptance paths outside git; no personal data or original Paperclip Skill content is committed.

## Still required for Issue closure
- This is a staged Runner and isolated generic-site validation; it is **not** installed-Extension acceptance or a real Paperclip on-demand Native Done result. After review and CI, verify built commit under installed Windows and WSL, trigger/collect/read-only evidence, and an entirely **new** test-only Paperclip Run with actual on-demand list → only requested `read_skill(part=0)` → native Done, Run succeeded and original-agent-attributed Comment.
- Do not require whole-Skill 11-part stress for normal on-demand completion. Preserve all past WEB-33–47 Runs, Host receipts, company state and credentials.
- No formal tag, npm publish, production Worker upgrade or previous Run replay was performed as part of this candidate.
