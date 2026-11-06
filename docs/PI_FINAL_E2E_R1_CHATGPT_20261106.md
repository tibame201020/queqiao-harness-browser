# Pi Web Ask — Final E2E Round 1/4: ChatGPT (2026-11-06)

**Scope:** Real installed WSL Pi and Windows Pi, each with a synthetic local project. This is the **first of four provider rounds**. No real project data, credentials or local user paths were transmitted to Web providers. No merge, release or npm publication.

## Preconditions

- Both Pi installations use four registered agent-aware slash commands, the existing 16 tools and the shared Orca Web Ask Core.
- WSL Orca subprocess is launched from a stable local directory, regardless of the Pi project cwd. The Windows installed transport was synchronized with the same source.
- The tests deliberately use a new synthetic `ProjectTag`, read-only fixture access and user instructions that differ in whether external consultation is mandatory.
- An E2E driver fails/terminates on the second `ask_chatgpt` invocation or if time expires. This prevents unbounded agent loops in the acceptance test; the installed extension itself does **not** yet enforce a per-task Ask limit.

## Evidence

| Platform / test | Observed tool calls | Result | Worker job |
|---|---|---|---|
| WSL, user forbids external consultation | `read` ×1; `ask_chatgpt` ×0 | **PASS**: Pi reported the actual synthetic ProjectTag and ended | `85c9b998-6658-4b78-a2bb-3fa0bba87119` |
| WSL, first mandatory consultation | `read` ×1; `ask_chatgpt` ×1 | **FAIL / NOT_SENT**: `PROMPT_INTEGRITY_FAILED`; no click/send; bounded test stopped | `3691441a-1ab4-4e5a-8620-fe39d9af4ed6` |
| WSL, mandatory retest after TDD repair | `read` ×1; `ask_chatgpt` ×1; `collect_chatgpt` ×1 | **PASS**: original context included, `PENDING → COMPLETED`, exact synthetic ACK, agent exited | `e1dd9a4a-263d-49e3-b017-b1726e96f51e` |
| Windows, user forbids external consultation | `read` ×1; `ask_chatgpt` ×0 | **PASS**: Pi reported the actual synthetic ProjectTag and ended | `2296d2bb-de81-4b07-9bde-08c39c82a415` |
| Windows, mandatory consultation | `read` ×1; `ask_chatgpt` ×1; `collect_chatgpt` ×1; status read; second Ask **attempted** | **FAIL**: `POST_CLICK_UNVERIFIED`; model attempted a second Ask; driver stopped it without certifying a completed send | `5ddcb3d0-2ca7-49c9-821a-717a94850f9d` |

### Proven root cause and TDD repair: WSL pre-send integrity false negative

- The original prompt was **198 characters**; the ChatGPT ProseMirror `innerText` was **202 characters** because it inserts visual newlines between `<p>` elements.
- A read-only reconstruction of the logical paragraphs matched the original Request Journal's SHA-256 exactly.
- `pi/orca-cli.mjs` now reads logical paragraph text (including intentionally blank paragraphs, but without counting a placeholder `<p><br></p>` as additional content), rather than trusting ProseMirror `innerText` for exact prompt integrity.
- Added a synthetic multi-paragraph TDD regression. The latest full Pi unit test count is **73**, including this test. All checks must be repeated on CI before merge.
- After proving the failed request's synthetic draft matched its journal hash, the draft was cleared on its pinned page without touching the original Receipt or other tabs.

### Open Windows failure

- First `ask_chatgpt` returned `UNKNOWN / POST_CLICK_UNVERIFIED`; subsequent `collect_chatgpt` and `chatgpt_status` did not establish completion.
- The Windows Pi model **attempted a second Ask** even though its instruction said not to. The E2E driver terminated the run when this was observed. This is an Agent Loop reliability failure; the model's compliance cannot be inferred from command registration or unit tests.
- A read-only postcheck found the original question still in the pinned ChatGPT home-page editor, with **no corresponding User or Assistant message visible**. The editor's reconstructed SHA-256 matched the latest `UNKNOWN` journal prompt hash. This suggests no successful send, but the original Click outcome remains uncertain; the Receipt therefore stays `UNKNOWN`, not `NOT_SENT` or `COMPLETED`.
- Only after confirming the synthetic draft's hash and the absence of chat messages was that draft cleared. The global Orca Page ID set and all other page URLs were unchanged. The original `UNKNOWN` Receipt remains available for analysis.
- At the end of the acceptance run there were **no matching Pi E2E/Agent child processes**, and the shared Windows/WSL Orca lock was released. This establishes no observed orphan process for this round, not long-run leak freedom.

## Round 1 verdict and next engineering issue

**WSL ChatGPT: PASS after TDD repair. Windows ChatGPT: FAIL — `POST_CLICK_UNVERIFIED`, followed by an attempted duplicate Ask.** The overall ChatGPT provider round is **not accepted**.

Root-cause investigation of the Windows post-click outcome and reliable small-model stop/reconciliation behavior is required. Do not blindly retry the existing `UNKNOWN` request. No assumption is made that the second Ask actually reached the Web page.

Rounds 2–4 (Claude, Grok, Mistral) are **NOT_ATTEMPTED in this final acceptance cycle**. They should be performed separately and should not inherit a PASS verdict from earlier prototype runs.

## Follow-up Retro result (same date; original failure retained)

The initial Windows FAIL recorded above remains historically accurate. Targeted TDD mitigations and four new forced-consultation E2Es are documented in [PI_R1_WINDOWS_FORCED_CONSULT_RETRO_20261106.md](PI_R1_WINDOWS_FORCED_CONSULT_RETRO_20261106.md). The observed Windows success path has now been reverified three times on fresh synthetic requests, WSL twice. This does **not** erase the original `UNKNOWN` record or establish a definitive cause for the intermittent underlying Click no-op. The same-prompt altered-question duplicate-send path is now blocked in the native Pi extension.
