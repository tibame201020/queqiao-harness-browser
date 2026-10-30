# Issue #55 — Folded long Project first-Send attribution (2026-10-30)

## Owner and boundaries

Browser Harness ChatGPT Site Adapter owns the first-Send UI attribution, not Paperclip, Queqiao Gateway or the connected App contract. Do not replay or unlock any previously ambiguous SOF CEO Run. Original Issue #55 long UNKNOWN attempt remains untouched.

## Reproduction / root cause

Installed **0.5.8** was exercised with independent, inert Project messages:
- 8,927 characters: `triggered/submitted` and canonical ID.
- 11,831 characters: a separate freshly initialized attempt also sometimes succeeds, demonstrating a **timing-dependent** failure, not unconditional failure by length. On read-only reopen, that 11,831-character User bubble was folded at exactly **10,240** visible characters with one `Show more` control.
- Issue #55 supplies independent **UNKNOWN** and read-only exact saved source evidence. This is a false-negative class, but the exact historical timing is not recoverable and is never reclassified.
- Deterministic fault-injected TDD on unmodified 0.5.8 produced **three RED** cases: (1) first `Show more` click fails during transient UI replacement, (2) canonical navigation remounts and re-folds the bubble, (3) the `Show more` control appears after the default five-second deadline. Code attempted expansion **once** and only extended the 12-second observation window after full text had *already* been verified. Thus a matching folded preview could time out before full verification was possible.

## Fix contract

- Only a single newly observed User bubble in a **first-Project Send** whose folded preview is correlated with the intended source (at least 10,000 leading normalized characters match, preview roughly 10,240, source longer than 10,240) can extend **observation only** to the existing 12-second first-save ceiling, provided the Composer is empty and route is eligible.
- Up to **four bounded UI-only Show more attempts** tolerate a transient failed click and canonical remount. No duplicate Send; no automatic retry of triggering, no blanket timeout expansion.
- **Only full source equality**, one unique attributable User Turn, settled empty Composer, canonical saved Conversation and (if Project route IDs differ) **first-party read-only membership in the original Project** grant `submitted`. Folded prefixes never grant submission.
- Unavailable expansion control, wrong expanded text, two turns, missing canonical save, incorrect origin, wrong Project membership or nonempty editor all remain `UNKNOWN` and non-retryable.
- Diagnostic schema stores only count/boolean/categorical folded evidence: `previewCorrelated`, `expandControlMax`, `expandAttempts`, `expandClickSucceeded`, `expandedFullTextMatched`, `canonicalSavedIdSeen`, `originalProjectMembership`; no raw prompts, DOM, IDs or credentials.
- General chat, medium prompts, Resume, Native MCP and the Issue #53 Project alias identity proof remain unchanged.

## Fresh evidence

- TDD: **3 RED** timing tests against original 0.5.8; after fix, **8 new tests GREEN** (including five negative ownership cases).
- Windows: `npm run check` **267/267 PASS** (35 files), TypeScript/build/package import/stateless runner PASS; production `npm audit --omit=dev --audit-level=moderate` zero vulnerabilities.
- Compiled **candidate 0.5.9** fresh isolated first Project triggers: **8,927 and 11,831 chars** both `triggered/submitted` with canonical IDs.
- 11,831-character candidate `collect`: `completed`, same canonical Conversation ID and exact synthetic Assistant marker.
- Independent read-only revisit: the saved Conversation is in the original Project list, the URL equals the Runner receipt, exactly one User and one Assistant; before UI-only Show more the visible User text is 10,240 chars, after expansion it is **11,831 chars exactly equal** to the original synthetic source. A readonly page need not show a Composer; the Runner's original Send already verified the empty Composer.
- This evidence validates the *new* synthetic flows, **not** the original historical UNKNOWN attempt or the separate Paperclip CEO→Board→Employee integration.

## Remaining distribution gates

GitHub Actions exact-commit CI, merge, newly installed Windows and WSL local Extension 0.5.9, installed-Extension long Trigger/Collect and independent readback; GitHub Release publication and npm Trusted Publishing are separate. Public npm authorization remains Issue #46. No personally identifying values in repo.
