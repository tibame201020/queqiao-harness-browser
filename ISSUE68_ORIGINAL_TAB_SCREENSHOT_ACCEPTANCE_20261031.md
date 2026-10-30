# Issue #68 — original-tab failure screenshot (2026-10-31)

## Product behavior and origin

An installed Browser Harness run can reach the exact saved ChatGPT Project Conversation yet fail **before Send** because the message Composer has no matching visible/editor DOM node during the existing 15-second precompose readiness window. A later read-only *new* tab may load the same conversation normally; it cannot reconstruct the original run-owned tab.

**v0.5.17 captures one actual viewport screenshot from the original run-owned page immediately after the specific `PRE_SEND_NOT_READY / precomposeReason=composer_absent` result and BEFORE `executeRunLifecycle.close()` closes that page.**

No screenshot is taken for a successful Send, postclick UNKNOWN, ordinary read-only Collect/Resume, true existing draft, or unrelated precompose failure. The capture is only an observable artifact; it cannot change `not_sent`, trigger a Send, change navigation, or extend/retry readiness.

## Local-only private storage

The screenshot may contain conversation or account information. Keep it **only** in the local Harness home, never in GitHub, issue comments, JSON receipts, model prompts, or public CI artifacts.

- Windows default: `%LOCALAPPDATA%\Queqiao\harness-browser\profiles\<profile>\private-diagnostics\composer-absent-<UUID>.png`
- Linux/WSL default: `${XDG_STATE_HOME:-~/.local/state}/queqiao/harness-browser/profiles/<profile>/private-diagnostics/composer-absent-<UUID>.png`
- If `QUEQIAO_HARNESS_HOME` is set, use that environment's actual configured home instead.
- The Runner returns only `diagnostic.failureScreenshot: {status:"saved", file:"composer-absent-<UUID>.png"}`, **not screenshot bytes or absolute paths**. If the capture fails it returns `{status:"capture_failed"}`. Both leave the original `unavailable/not_sent` result unchanged.
- The directory is created with POSIX mode `0700`, the file with `0600`; on Windows, storage remains under the current user's per-user LocalAppData. No automatic upload or retention cleanup is added. The operator can inspect/delete private images manually.

Because a screenshot contains sensitive UI, inspect it locally before describing it in a GitHub Issue; redact any personal or account content before public sharing.

## Test contract

Deterministic RED→GREEN tests verify: screenshot taken once only for `composer_absent`, physically written under the private profile directory and byte-identical; no capture for success, postclick ambiguous or different precompose reasons; Playwright screenshot errors are diagnostic-only with original `not_sent` preserved. Windows and WSL local checks and GitHub Actions must each run after the change. A controlled **read-only** browser screenshot proves browser capture and local storage, but it is not a genuine #68 failure screenshot.

## Acceptance boundary

This change preserves the actual failing page image when a future original run reproduces the condition. It does not establish the UI hydration root cause. Issue #68 stays OPEN until a genuine failing original page is captured and investigated, followed by independent native acceptance. No Paperclip governance or Native Loop pacing changes are made by this Browser Harness patch.
