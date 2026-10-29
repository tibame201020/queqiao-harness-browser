# Issue #53 — attribution-first investigation and narrow Project provisional fix

Date: 2026-10-30 Asia/Taipei. Owner: Browser Harness ChatGPT Site Adapter.

## Facts, not assumed ownership

- The original SOF first Project dispatch returned `SEND_OUTCOME_UNKNOWN` after a noncanonical `local-chatgpt` Project URL and **0 → 2** User-bubble candidates. It has no verified canonical Conversation ID. That original attempt is **not** eligible for replay or success reclassification.
- Installed 0.5.7 already passed short first Project chat in Issue #51. An independent, **new** synthetic 8,628-character Project Send with unmodified 0.5.7 produced a provisional URL, then a canonical saved Conversation within the existing window. Its observed new-bubble count was **1** and its one Send settled. Therefore **provisional URL appearance is normal site behavior**, not evidence of a fault by itself.
- The original failing session's browser tab was no longer open in the authorized CDP browser when read-only inspection was attempted. It was not possible to recover its exact two-bubble DOM or prove server persistence from the reported provisional UUID. The difference between **two distinct User Turns**, **duplicated DOM representation**, or **site persistence failure** remains UNKNOWN.

## Confirmed Browser Harness defect (distinct from unproven two-bubble cause)

- The existing first-Send grace recognized `/c/local-chatgpt%3A<uuid>`, but not the authenticated Project shape `/g/<project>/c/local-chatgpt%3A<uuid>`.
- A controlled synthetic fixture preserved **one newly added exact User Turn**, an empty Composer and delayed canonical Project save (~6.8 seconds). Against the unchanged 0.5.7 implementation, the test was **RED**: exit `DISPATCH_AMBIGUOUS` at 5 seconds (`target_unconfirmed`). The existing general-chat equivalent was already GREEN.
- The narrow fix reads a **first-party, validated pre-click Project landing identity**; a Project provisional may extend observation **only if** its embedded Project ID equals that pre-click identity and the same single-User-turn exact-text/editor-empty proof succeeds. The final canonical Conversation must also remain in that same Project. No project-ID guess, local UUID acceptance, blanket timeout extension or retry.
- New Issue #53 tests (one positive delayed-save + six negative no-save/wrong-content/multiple-turn/nonempty-editor/wrong-Project or wrong-canonical-Project) moved from **1 RED + 5 GREEN** to **7 GREEN**. The **0 → 2 bubble case remains UNKNOWN by construction** and never produces a submitted receipt.

## Candidate live E2E — counterevidence, merge BLOCKED

A fresh, synthetic candidate **0.5.8** Project Trigger using a new isolated Runner profile returned `ambiguous / SEND_OUTCOME_UNKNOWN` after one Send; no retry occurred. Its post-click evidence showed **0 → 1** bubbles, empty Composer, `verifiedNewTurn=false`, `target_unconfirmed`. The final observed URL was a **canonical Project Conversation with a server UUID**, not a provisional local UUID.

Independent authorized read-only revisit of the **same saved canonical URL** found **one User message with exact full synthetic source**, **one Assistant with exact synthetic response marker**, and the configured Project title visible in the conversation. Therefore the synthetic Send **did persist** despite the candidate Harness returning UNKNOWN. It would be unsafe to call the candidate E2E PASS based only on that independent readback because the Runner never attributed the result.

Read-only Project-ID checks produced different matches when taken from the Projects list versus the saved Conversation sidebar; further investigation must establish whether first-party Project ID aliases, site redirect, timing or concurrent UI state caused this mismatch. No real ID or private content was logged to repository files. This observation is **not** evidence about the original two-bubble SOF Attempt, which is still UNKNOWN.

**Release gate:** Do **not** Merge, install this candidate, publish, or close Issue #53. The patch is a narrow validated correctness change in a controlled fixture, but actual Project first-chat attribution is still unresolved. Next discriminating check must capture pre-click Project identity and post-click canonical ID from the **same isolated tab** with categorical/redacted diagnostics and demonstrate a single canonical same-Project receipt before changing the target rule.

## Tests and acceptance evidence

- Windows full `npm run check`: TypeScript, Vitest **247/247**, build, package import and stateless runner PASS. Production `npm audit --omit=dev`: 0 vulnerabilities.
- Re-test exact merged commit in GitHub Actions before merging/deploying.
- Run a fresh isolated, test-only Project Trigger → Collect through a compiled candidate/installed Extension and independent canonical Conversation readback. Never operate on the historical SOF CEO dispatch.
- Status of this code change is **narrow correctness fix**; it is **not proof that the original SOF failure was a Browser Harness failure rather than ChatGPT state/persistence or a distinct two-bubble defect**. Leave Issue #53 open until the two-bubble cause and future genuine SOF Run are independently resolved.

## Privacy and boundaries

No credentials, Project names or IDs, conversation URLs, real prompts, personal details, CDP endpoints, cookies or provider account data may enter source/tests/docs. Nothing in Paperclip governance, n8n, Queqiao Gateway, CI Runtime or other provider adapters is changed. Preserve `unknown` on every unproven post-click attempt.
