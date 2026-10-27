# Issue #32 — ChatGPT read-only Resume page availability

## Boundary and confirmed defect

Browser Harness 0.5.5-rc.5 could return `pending/submissionState=unknown`
when a read-only Resume navigation received HTTP 403 or a challenge page.
This hid site unavailability from callers. It does not establish that the
original one-click Send failed. The original private Send Attempt and its
no-resend lock must be preserved.

Issue #32 is independent of #30 (durable original Attempt and read-only
reconciliation). Paperclip delegation and WebChat Host polling are outside
this repository.

## Resume classification

| Evidence | Result | Caller behavior |
| --- | --- | --- |
| HTTP 2xx, canonical saved Conversation, exact unique new User Turn, settled editor | `submitted/submitted` | May proceed to separate Collect |
| HTTP 2xx, target loaded, original new User Turn still absent/unproven | `pending/unknown`, `canResume:true` | May repeat bounded read-only Resume later |
| Non-2xx or missing navigation response | `unavailable/unknown`, `NAVIGATION_HTTP_ERROR` | Stop polling; keep Attempt locked |
| Navigation exception | `unavailable/unknown`, `NAVIGATION_FAILED` | Stop polling; keep Attempt locked |
| Recognized HTTP 200 challenge title | `unavailable/unknown`, `SITE_CHALLENGE` | Stop polling; keep Attempt locked |
| Page inspection error | `unavailable/unknown`, `PAGE_UNAVAILABLE` | Stop polling; keep Attempt locked |

All unavailable cases set `retryable:false` and `canResume:false` as a
**current-observation stop signal**, not a claim that future read-only
reconciliation is permanently forbidden. A caller can explicitly request a
fresh Resume after page access recovers. No unavailable result authorizes
another Send, acknowledgement or clearing of the active Attempt lock.

## Count/content discrepancy diagnostics

The original #30 proof still requires exactly one new User Turn relative to
the before-Send baseline. A matching last bubble with **unchanged count**
does not confirm submission. Read-only Resume now exposes bounded
`diagnostic.turnEvidence` counts (before/current/min/max) and booleans:
`sameCountLastMatchesOriginal` and `sameCountLastChanged`.

The latter compares private, in-memory HMAC fingerprints of the last visible
User Turn during a single Resume observation window. No fingerprint, key,
prompt text, DOM, cookie or private URL appears in the result. This may detect
count-preserving list churn but cannot recover a missing pre-click stable Turn
identity. That historical B7 ambiguity remains unknown and is not replayed.

## Execution and deployment gates

New test cases exercise HTTP 403, HTTP 200 challenge, failed navigation,
normal HTTP 200 pending, and content-matching or changing last Turn with
unchanged baseline count. Existing duplicate, wrong-text, wrong-origin and
single-Send tests remain active.

- Local RED: previously `pending` for 403, challenge and navigation failures.
- Local GREEN: targeted 11/11.
- Full `npm run check`: 208/208 tests, 33 files, TypeScript, build, package import.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- GitHub Actions, installed Windows/WSL extension and new original live site
  read-only acceptance remain merge gates until recorded separately.

No historical WEB-xx Run or original unknown receipt may be resent, mutated
or marked complete by this change.
