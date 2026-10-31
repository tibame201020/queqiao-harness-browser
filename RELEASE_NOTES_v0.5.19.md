# Browser Harness v0.5.19 — Issue #75 optional CDP recovery

- Default **attach-only** CDP behavior unchanged. Unavailable listener is now `CDP_ENDPOINT_UNAVAILABLE` with sanitized `endpointStatus` and `recovery`, not a generic Runner exception.
- **Opt-in** `browser.cdpRecovery: "harness-owned"` with a dedicated loopback `cdpUrl`, explicit matching `debugPort`, and private default Harness Profile. One bounded private Chrome launch, `/json/version` readiness probe, then exactly one CDP reconnect. Never relaunch/close a daily-driver browser.
- `harness_status.browserEndpoint` reports the observed local CDP endpoint state separately from interval supervisor `desiredStatus/observedStatus`.
- `harness_bootstrap` remains managed-only, including its **close** action.
- TDD and real synthetic private Chrome recovery details: `ISSUE75_CDP_RECOVERY_ACCEPTANCE_20261031.md`.
- This does not claim that original Chrome's exit cause is known, that any user was logged in, or that an n8n V2 real Collect completed.
