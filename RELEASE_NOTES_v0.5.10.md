# Browser Harness v0.5.10 — canonical Project first-Send hydration (#57)

- Fix a v0.5.9 post-click false UNKNOWN during a new Project Conversation's canonical route hydration/remount. A first-party canonical saved UUID and an empty Composer are reasons for **bounded observation only**, never standalone proof of Send; only first-Project Send with pre-click Project identity and baseline zero qualifies for the existing 12-second ceiling.
- Handle transient `0→2→0→1` User-bubble render churn without calling the early 2 a confirmed double Send. The final full exact User source, settled Composer and canonical UUID are still required.
- When 2+ bubbles were transiently observed, require **independent read-only server-saved Conversation** proof of exactly one unique full-matching User Turn (stable recheck), plus original first-party Project membership, even if the route Project IDs agree. Wrong text, two persisted turns, missing membership, no hydration, foreign origin or stale Composer remain UNKNOWN with no Send retry.
- Count/boolean-only diagnostic hydration evidence; never persist raw prompt, private IDs or DOM in repository.
- Deterministic RED→GREEN Issue #57 regression and eight negative ownership tests. Candidate 276/276 unit tests and real synthetic 7,100-character first Project Trigger→Collect→independent readback PASS.
- Original SOF CEO Run is not replayed or reclassified; Paperclip Native and Connected App acceptance remain separate.
- GitHub Release, Windows/WSL local install, and public npm registry are distinct distribution states; npm Trusted Publishing blocker tracked as #46.
