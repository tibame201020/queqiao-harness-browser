# Browser Harness v0.5.11 — Original first-Project Send recovery (#60)

- Fix v0.5.10 first-Project Send falsely left `UNKNOWN` when React post-click DOM count remounted although the original saved Conversation could be recovered.
- Persist the **original attempt before Send** (prompt, pre-click Project identity and Profile binding, baseline), with no guessed Conversation ID. Preserve a subsequently observed canonical saved URL.
- On transient DOM ambiguity, do **read-only same-Conversation reconciliation** using the original Project membership and final unique saved User content. Return existing `triggered/submitted` when recovered so `collect` continues; otherwise keep `UNKNOWN`, no Send retry.
- Support existing Runner `resume` for first-Project Attempt after a prior ambiguous result. Do not add a new provider, permissions, approvals, policy or governance layer.
- Tests cover persistence, immediate recovery, delayed hydration, non-owned/duplicate/wrong Project cases, and existing #55/#57 regressions.
- Public npm release workflow is a separate publishing issue; local Windows/WSL Extension installation is independently verified.

- During read-only Project hydration, tolerate a first-party Project route alias rewrite if the **saved Conversation UUID** remains equal and original Project membership and the complete User message match; do not require transient URL string equality. Regression test added.
