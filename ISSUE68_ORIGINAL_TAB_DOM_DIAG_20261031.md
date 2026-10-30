# Issue #68 — original run-tab hydration diagnosis (2026-10-31)

## Evidence and scope

Actual native Paperclip CEO Runs on installed v0.5.15 stopped on saved-Project continuations before any SendAttempt or Send. Both remained at the original Conversation with generation inactive and **zero visible Composer candidates for ~15 seconds**. One previous diagnostic incorrectly called that `editor_read_failed`, although no editor text-read failure was confirmed. The run-owned CDP tab is closed at the end of the Run, so it cannot be inspected afterward.

An independent CDP read-only tab subsequently opened the exact original saved Project Conversation URL and exposed a Composer. A new controlled comparison repeated two read-only paths with the **same CDP browser configuration and original saved Conversation**: (A) open Project then navigate through its saved Conversation link, (B) direct original canonical Project URL. Both became ready in newly owned tabs; same final URL, one visible Composer and two saved User-message bubbles. That means **navigation order alone did not reproduce the missing original-run editor**. The original site's hydration/network/mount mechanism remains UNKNOWN. Do not claim a React remount, page race or login cause without further first-party evidence.

## Diagnostic-only change

The original run-owned page now supplies two bounded, fixed-schema read-only DOM snapshots: one at the start of the existing precompose readiness check and one only on a failed precompose deadline. Each snapshot contains only:
- `document.readyState` (controlled enum), `document.visibilityState` (controlled enum)
- Number of `main` elements, raw `#prompt-textarea` elements, raw editable textboxes and body child elements (bounded integers)

No DOM text, user prompt, cookies, storage, full snapshot, account data or network URL is collected. Diagnostic read errors yield `unknown` / `-1` and **do not alter** the Send result.

A deadline with **zero selected visible Composer candidates** is now marked `precomposeReason=composer_absent`, distinct from a persistent failure to read an existing editor's `innerText`/`textContent` (`editor_read_failed`). A genuine draft, wrong target or failed focus retain their existing protection. Nothing changes in navigation, timing, focus, Send, Resume, or Paperclip governance. Original Send remains at most one click.

## TDD / acceptance

- RED→GREEN: visible Composer entirely absent at deadline -> `composer_absent`, original-page initial/terminal numeric/enum readback, **no Send**.
- RED→GREEN: hidden raw editor present but no visible Composer -> raw count recorded, still `not_sent`.
- An interrupted DOM diagnostic read cannot change `not_sent`; `unknown` fallback is safe.
- Existing #66 `editor_read_failed`, #68 focus and draft protections remain under the full regression suite.
- Windows and WSL tests, merged-main GitHub Actions, staged Extension install, and fresh genuine SOF native readback are **separate acceptance evidence**. This diagnostic patch does *not* by itself fix the missing-editor site condition and must not close #68.

This document contains no user data, original Project URLs, native Run IDs, account identifiers, secrets or private prompt content.
