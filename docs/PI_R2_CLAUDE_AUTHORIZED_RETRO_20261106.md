# Pi Claude Round 2/4 — Authorized Draft Clearance, Retro, and Re-acceptance (2026-11-06)

## Verdict and boundaries

**Final observed verdict: PASS** for a mandatory Claude consultation in both actual installed WSL Pi and Windows Pi, using two different synthetic project fixtures. The final strict test deliberately did **not** put the expected answer in the user's prompt: Pi read `PROJECT_CONTEXT.txt`, provided the actual ProjectTag and Goal to `ask_claude`, and Claude returned exactly the ProjectTag. The final pair of test runs had one Ask each, normal Pi Agent termination, a journal-backed `COMPLETED`, a verified prompt hash and provider-scoped terminal UI evidence.

This document records the path from the original **BLOCKED** outcome and the intervening failures without rewriting them as passes. No real project contents, user credentials or account identifiers were sent or added to Git. The browser pages and local request journals are kept outside Git; the work remains on a Draft PR, not merged or released.

## Evidence: chronological

| Action | Actual result | Job/reference |
|---|---|---|
| Initial WSL local-only test | `read` ×1, Ask ×0, Pi completed; PASS | `dc73b86c-5d36-4737-8813-5dd93448c808` |
| Initial Windows local-only test | `read` ×1, Ask ×0, Pi completed; PASS | `43ed2237-d42b-401d-bebe-c42740736078` |
| Initial WSL / Windows forced tests | `read` ×1, Ask ×1 → `NOT_SENT / DRAFT_PRESENT` on both; BLOCKED | `39ed07ba-c307-4165-8b8c-e491c5d3e9bf` / `194ab91d-2069-44ca-bb3f-7150ced76df2` |
| User-authorized draft clearance | WSL cleared **219-character** existing draft from pinned Claude `/new` tab. Windows then confirmed editor already empty, showing both operate the same pinned page. No other Page IDs or URLs changed. | Local-only authorized clear script, both hosts |
| WSL forced rerun after clearance | `read` ×1 → Ask ×1 → `NOT_SENT / PROMPT_INTEGRITY_FAILED`; no Click. | `7cfe5a76-16de-4b63-84da-44ee75069b75` |
| WSL repaired-code simple mandatory test | `read` ×1 → Ask ×1 → Collect ×1 → `COMPLETED`, exact synthetic ACK; PASS | `86469c2d-368a-4756-9426-d54538292523` |
| Windows first mandatory test after repair | Remote `COMPLETED` and exact ACK but Pi's sent question **omitted ProjectTag and Goal**; strict context criterion FAIL | `627ef97b-23fb-4b35-b155-1077ee3c1168` |
| Windows **strict context** test | Pi read synthetic fixture and sent ProjectTag + Goal. Claude returned exact ProjectTag (not disclosed in the user's prompt); Ask ×1 → `COMPLETED`; PASS | `4514e1e5-e875-4bc8-b7be-6ad9ba2a4835` |
| WSL initial strict context test | `read` ×1 → Ask ×1 → `NOT_SENT / COMPOSER_UNAVAILABLE`, no Click; onboarding UI obstructed composer | `c95820a6-077a-4178-9ef3-78acd2a6d137` |
| WSL Claude onboarding cleanup | Confirmed the pinned `/new` page displayed a modal titled **Create files and artifacts**. Its backdrop marked the composer `aria-hidden=true`, and the accessibility snapshot had no textbox ref. Clicked only the modal's unique **Close** control. Editor ref returned; same Page IDs/URLs and other tabs unchanged. This was an onboarding prompt, not a CAPTCHA or security challenge. | Local-only pinned tab inspection and single click |
| WSL **strict context** retest | Pi read a new synthetic fixture and sent ProjectTag + Goal. Claude returned exact ProjectTag; Ask ×1 → `COMPLETED`; PASS | `f981cbe5-07b7-411b-8282-61c41c6b60bf` |

### Root cause: Claude multiline Prompt integrity

The Claude ProseMirror editor rendered a **296-character** four-line prompt as **299 characters** via `innerText`: one extra visual newline per paragraph boundary. A read-only DOM inspection showed four actual `<p>` nodes. Reconstructing the logical text from those nodes produced a SHA-256 digest **exactly matching** the original durable request's `prompt_hash`. Nothing was lost or changed in the prompt; direct `innerText` comparison had produced a false integrity failure.

The targeted fix is in `pi/web-providers.mjs`: when Claude's editor is a collection of `<p>` siblings, recursively reconstruct each paragraph's text, preserving inline text and intentional blank paragraphs, and join with the actual logical newline. The strict equality check and prompt hash remain unchanged. Other providers retain their previous extraction. Two **RED → GREEN** Node tests cover ordinary multiline input and a blank paragraph with nested formatting.

The failed synthetic draft was removed **only after** the corrected DOM extraction independently matched its original request hash; no click/send occurred. The original `NOT_SENT` receipt was retained and new synthetic questions were used for all reruns.

### Model behavior vs Transport

Windows's first repaired-code E2E reached `COMPLETED`, but the actual browser User Message did not contain ProjectTag or Goal. This was a **Pi context-selection failure**, not a Transport or Completion Evidence failure. A stricter test intentionally withheld the expected output from the initial Pi prompt and required the answer to derive from the read file; Windows and WSL both passed that test. These results prove the observed strict cases, **not** that a 9B model will always select appropriate context without guidance.

The WSL `COMPOSER_UNAVAILABLE` happened on a new-chat page with an accessibility-hidden input beneath an unrelated Claude onboarding modal. Only the modal's unique Close control was clicked; no account challenge was bypassed and no additional browser tab was touched. The extension was not changed to auto-dismiss arbitrary dialogs.

## Final receipt and cleanup checks

Both final strict-context receipts were read directly from the platform's private Request Journal and each satisfied:

- Exactly one matching completed receipt; exact ProjectTag answer and a valid SHA-256 original prompt hash.
- A valid Claude conversation binding, plus `completion_evidence=latest-assistant-terminal-action-v1`.
- The configured shared Orca lock was released after execution.
- Zero relevant Pi E2E child processes remained on Windows or WSL.

**Residual risks:** Claude UI can introduce onboarding dialogs or selector changes. A local 9B model can sometimes omit context even after reading it; do not weaken acceptance to short ACK-only tests. Any `UNKNOWN` after an attempted Click must remain unresolved until read-only recovery succeeds, without a blind second Ask.

## Engineering and release status

- The only application change for this follow-up is the Claude editor text extractor, with two focused unit tests.
- Full WSL check and native Windows Pi tests are required on the final commit; GitHub Actions must be read back before reporting current-commit CI success.
- Draft PR #81 remains open; no merge, release, or publication is authorized by this Round 2 acceptance.
- Grok and Mistral final E2E rounds remain **NOT_ATTEMPTED** here.
