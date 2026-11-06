# Pi Native Orca Web Ask — Four-provider code review / Release Readiness (2026-11-06)

## Reviewed scope

Review of actual GitHub [PR #81](https://github.com/tibame201020/queqiao-harness-browser/pull/81) compared with its **real** base `feat/pi-chatgpt-tool`. The patch has 26 changed files (Pi commands, Agent event guard, four-provider Transport/DOM/Completion Evidence, receipt core, installation, tests and documentation). The implementation does **not** change the Browser Harness Runner, n8n Workers, browser ownership model or original authenticated profiles.

**Functional E2E status: PASS for four providers on both Windows Pi and WSL Pi in their respective rounds**, with actual model-issued file read → one Ask → read-only Collect → unique durable `COMPLETED` and UI terminal-action evidence. See [the separately recorded rounds](PI_FINAL_E2E_ALL_PROVIDERS_20261106.md). These synthetic observations do **not** prove unattended long-term site/UI reliability.

**Release disposition: HOLD / NOT RELEASE READY.** This is not a failing E2E verdict. It means the stacked parent and independent review/release decisions remain unresolved. PR #81 and its parent PR #78 were independently read from GitHub; both are open **Draft**, neither merged, and both have **zero submitted GitHub Review records** at this check. PR #81 targets the parent feature branch, not `main`. No merge or release action was attempted.

## Review findings, verified evidence, and fixes

| Severity | Finding | Evidence | Disposition |
|---|---|---|---|
| **P1 — fixed in this review** | A completed response could be overwritten by a *stale concurrent Collect*, changing the durable receipt back to `PENDING` or `UNKNOWN`. | Two new deterministic RED tests used serialized `withLock` callbacks: collector A obtained terminal UI evidence and saved `COMPLETED`; collector B had read `PENDING` before waiting for the lock, then overwrote it. | `pi/web-ask-core.mjs` now **re-reads the latest receipt while holding the existing shared lock**. A valid `COMPLETED` short-circuits without a second browser Collect. Terminal status is monotonic in this tested concurrency path. Both tests GREEN. |
| **P2 — fixed in this review** | Two collectors handling the same post-click `UNKNOWN` could each execute read-only recovery based on a stale state and write it twice. | A third deterministic RED test demonstrated recovery called twice on one original receipt despite serialized lock. | Recovery now re-reads inside the lock. If another collector already advanced the record, it reuses the durable state and does not recover again. Test GREEN, single original Ask. |
| **P2 — ongoing UI risk** | Windows ChatGPT's intermittent no-op Click remains without a proven root cause; external sites can change DOM/terminal actions or display onboarding. | Earlier Round 1 FAIL and Round 2 onboarding obstruction, followed by successful independently recorded re-runs. | Conservative send readiness, strict prompt hash, durable UNKNOWN and no duplicate Ask are implemented. These do **not** establish that all future site versions will work. Any mismatch fails closed. |
| **P2 — model boundary** | Pi may sometimes omit key project evidence in an external question. Context selection and sensitive-data exclusion are currently model-guided, not a deterministic DLP guarantee. | Earlier Windows Claude ACK-only test completed without ProjectTag/Goal; later strict withheld-answer project tests passed. | Keep strict context-dependent E2E acceptance and never use the extension for confidential project material without a separately validated data-handling policy. No speculative wrapper or new orchestration introduced here. |
| **Operational — fail closed** | A Pi process crash with `DISPATCHING` persisted before the final receipt write cannot prove whether a Web send happened. | Existing explicit-claim/crash Node test and `pi/web-ask-core.mjs` state machine. | It is surfaced as unresolved `UNKNOWN`, never blindly resent; operator reconciliation may be necessary. Do not treat this as a confirmed NOT_SENT. |

### Exact implementation changes made during this review

Only `pi/web-ask-core.mjs` and its Node regression suite (`pi/chatgpt-core.test.mjs`) were changed after the four provider rounds. The core still validates original prompt hashes, provider-specific canonical conversation identity and `latest-assistant-terminal-action-v1` before writing `COMPLETED`. The shared lock is **already** part of the product; no new persistence layer, lock service or orchestration system was added. The tests deliberately exercise concurrent operations and preserve the no-resend condition.

## Cross-platform proof and test boundaries

- Cross-platform Orca lock identity was verified by independently normalizing and hashing the **actual** Windows and WSL configuration paths: both produced the **same physical Windows path fingerprint**. The WSL path lies on the Windows-mounted volume; both parents exist. The actual paths, file contents and credentials are deliberately omitted.
- Both installed Pi extensions were reinstalled with the reviewed `web-ask-core.mjs` and **source SHA-256 matches on Windows and WSL**. Existing running Pi sessions still need a reload/restart. No browser tab was opened or closed by the installer.
- A separate **actual installed-module, read-only four-provider receipt regression** ran on Windows and WSL after the repair: cached ChatGPT, Claude, Grok and Mistral receipts all returned `COMPLETED` with unchanged stored answers. Every injected Transport method threw if called, confirming these already-completed receipts required **zero browser operations or sends**. These are post-fix read-only sanity checks, **not** eight new full live Web sends.
- New **3 deterministic concurrency Node regressions**, RED then GREEN. All three passed; the focused suite was rerun **five additional times** without a failure. Full WSL `npm run check` includes TypeScript typecheck, Vitest, package/build checks and Pi tests. Windows has a separate `pi-windows` workflow using `npm run test:pi` on the actual final SHA.
- The **final GitHub Actions commit SHA/run verdict must be checked separately**; previous successful runs do not certify a subsequent fix.
- Package contents and staged changes must be reviewed for private data before pushing. Local profile/config, journal entries and user paths must **not** enter Git.

## Release decision

**Accept the observed functional four-provider E2Es and the reviewed concurrency fix when the final-commit tests pass. Do not yet claim independent approval or production release readiness.** The concrete remaining gates are the stacked parent PR #78, an independent reviewer decision (neither PR has a submitted GitHub Review), and any required extended reliability validation of the known site-click and model-context risks. The user did not authorize a merge or release in this review step; keep PR #81 Draft and unmerged.
