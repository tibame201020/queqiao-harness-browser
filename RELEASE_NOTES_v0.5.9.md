# Browser Harness v0.5.9 — folded Project first-Send attribution (#55)

- Correct the 0.5.8 one-shot `Show more` assumption: transient click failure, delayed expansion control or canonical navigation remount may leave a uniquely owned long User Turn folded at 10,240 visible characters.
- Add bounded **UI-only** expansion re-observation (at most four attempts) and a maximum 12-second observation window **only** when a new Project User bubble's folded prefix correlates to the full original long source and the Composer is settled. No Send retry.
- Keep strict **full expanded source match**, unique User turn, canonical saved ID, and original Project membership requirements before returning `submitted`. Folded prefix alone never confirms Send. Unsafe or missing proof stays UNKNOWN and non-retryable.
- Emit sanitized count/boolean/categorical folded diagnostics. Protect raw messages, browser identifiers and account data from repository logs.
- RED→GREEN: three first-Project long timing cases and five negative cases. Candidate full suite 267/267 PASS, production dependency audit zero vulnerabilities; compiled candidate synthetic 11,831-char Trigger→Collect and independent full-source readback PASS.
- Historical Issue #55 UNKNOWN profile is not replayed or retrospectively acknowledged. Paperclip Connected App/CEO flow remains a separate integration acceptance.
- GitHub Release, Windows/WSL local installation and npm registry publication are distinct distribution states; npm publishing authorization remains Issue #46.
