# Pi Web Ask — Final E2E Round 4/4: Mistral (2026-11-06)

## Verdict

**PASS — Windows and WSL native Pi, both with a mandatory project-aware Mistral consultation.** The two final E2Es used distinct synthetic fixtures. Each user prompt instructed Pi to **read** the local fixture and send the actual ProjectTag + Goal to `ask_mistral`; the originating user prompt did not reveal the expected ProjectTag value. Mistral returned that exact value. Each Pi Agent terminated normally after **one Ask**, read-only Collect/Status, and durable `COMPLETED` with UI terminal-action evidence.

The first attempts exposed *two distinct false negatives* caused by Mistral ProseMirror paragraph rendering: (1) the unsent editor, and (2) the already-sent user bubble. Both were corrected through TDD without weakening exact Prompt Hash matching. All prompts were synthetic. No real user project code or secrets were sent externally or committed. Other browser tabs and existing non-test drafts were not changed. The PR is still Draft and unmerged.

## Real Pi and Orca E2E evidence

| Platform and test | Actual observed tools / result | Worker job | Verdict |
|---|---|---|---|
| WSL local-only `/ask-mistral` | `read` ×1, `ask_mistral` ×0, Pi reports synthetic ProjectTag and exits | `138d1115-b942-43fe-a708-eab0f60b1ace` | PASS |
| Windows local-only `/ask-mistral` | `read` ×1, `ask_mistral` ×0, Pi reports synthetic ProjectTag and exits | `c2665853-aac1-44e6-aa7c-d787ca1a552c` | PASS |
| WSL forced, initial | `read` ×1 → `ask_mistral` ×1 → `NOT_SENT / PROMPT_INTEGRITY_FAILED`, no Enter; source context included | `35e6f635-982c-4319-a080-52f1281ff11a` | FAIL / NOT_SENT |
| WSL forced after editor parser fix | `read` ×1 → `ask_mistral` ×1 → `UNKNOWN / POST_CLICK_UNVERIFIED`; Collect/Status still UNKNOWN; Pi exited without repeating Ask | `09b12061-77aa-4742-95ec-5b3652c68b07` | FAIL / UNKNOWN at run end |
| WSL read-only recovery of original UNKNOWN | Existing pinned conversation had exact user turn and completed assistant answer. Corrected user parser verified original `prompt_hash`. **One read-only `collect_mistral` recovered same Receipt to `COMPLETED`**; no new Ask or resend | Local one-off read-only recovery | PASS (receipt reconciliation only) |
| WSL forced, final **fresh** question | `read` ×1 → `ask_mistral` ×1 `PENDING` → `collect_mistral` ×2 (`PENDING`, then `COMPLETED`); local ProjectTag supplied and exact answer; normal Agent exit | `6bb9b4aa-545c-4b15-9085-8a1db3268c2d` | PASS (~23.3s) |
| Windows forced, final **independent** question | `read` ×1 → `ask_mistral` ×1 `PENDING` → `collect_mistral` ×2 (`PENDING`, then `COMPLETED`); local ProjectTag supplied and exact answer; normal Agent exit | `b43e8bee-fd7a-489f-9d8b-7beddaa20f28` | PASS (~15.8s) |

The E2E monitor rejects a second Ask, incorrect/missing synthetic ProjectTag, a wrong answer, and a Pi Agent that does not terminate normally. Status queries are read-only. Original failures remain in the test record; the journal's single original post-click UNKNOWN was **reconciled**, not re-sent or silently reclassified.

## Retro A — unsent Mistral editor newline expansion

The initial WSL failure was **before Enter**. Mistral's ProseMirror editor contained five `<p>` elements, including an intentionally empty paragraph. The original prompt had **272 characters**, but `innerText` exposed **277** because of extra visual separators. DOM paragraph reconstruction produced a 272-character string with a SHA-256 digest **identical** to the failed Request Journal's `prompt_hash`. No data had been lost.

Two Mistral-specific RED→GREEN Node tests now cover multi-paragraph input, an intentional blank line and nested inline formatting. `WEB_READONLY_INSPECT_JS.mistral` reconstructs logical paragraph text while preserving original whitespace; it does **not** remove arbitrary newlines or relax strict equality. The initial `NOT_SENT` Receipt was retained. Only its uniquely proven synthetic draft was cleared from the pinned Mistral page after comparing SHA-256, checking zero user turns and no active generation; all other Orca Page IDs and URLs were unchanged.

## Retro B — post-Enter user bubble false-negative, not actual send failure

With the editor repaired, a later WSL Pi run issued a single Enter and returned `UNKNOWN / POST_CLICK_UNVERIFIED`. Read-only inspection **proved that the Web send actually succeeded**: the pinned page had a new Mistral conversation URL, the editor was empty, one user message existed and a completed assistant answer was visible with the provider-specific terminal action.

The observed user message rendered into five `<p>` descendants. Its plain `innerText` was **278 characters**, whereas the exact original submitted question was **273**. The post-submit user text extractor was still reading `innerText` and failing the hash check. A second set of RED→GREEN tests covers the sent user's paragraph DOM and a plain-message fallback. The fix uses the same **Mistral-only** exact logical paragraph reconstruction for the last User Message. A live read-only DOM check then proved the 273-character text matches the **original** UNKNOWN receipt hash.

After the fix and installation, `collect_mistral` performed **read-only recovery** of the original UNKNOWN request. The persisted journal changed from `UNKNOWN` to `COMPLETED` because the original user turn, conversation identity, completed answer and terminal UI action all verified; `completion_evidence=latest-assistant-terminal-action-v1` was stored. No `ask_mistral`, Enter or Click was retried for this request. A subsequent **new** synthetic request was used for the full Agent-loop acceptance.

## Final receipt, runtime and CI requirements

Read-only journal audits on both platforms confirmed exactly one final matching receipt with `COMPLETED`, exact fixture-derived ProjectTag, a valid SHA-256 prompt hash, provider-pinned canonical Mistral conversation binding, and `latest-assistant-terminal-action-v1`. On both hosts, zero relevant Pi E2E process IDs remained and the shared Orca lock was free. These are short-run observations, not leak-free soak-test guarantees.

- WSL `npm run check`: **42/42 Vitest files**, **93/93 Pi Node tests**, zero failures. Windows native Pi **93/93** PASS, installed source hashes verified.
- GitHub Actions **must be verified for the final pushed commit**, not inferred from the prior round's CI results.
- The shared provider parser only changes the Mistral input and sent-user text paths (plus the previously proven Claude/Grok paragraph code); ChatGPT completion logic, per-user-prompt duplicate-send guard and original journal semantics remain intact.
- UI selectors and Mistral's **Read aloud** terminal action may change upstream; the implementation fails closed instead of assuming text stability alone proves completion.

**Round 4/4 accepted for these observed strict-context Windows and WSL runs.** A whole-four-provider review, independent code review and release/merge criteria are separate from this provider-level test verdict.
