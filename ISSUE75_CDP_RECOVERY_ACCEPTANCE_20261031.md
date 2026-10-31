# Issue #75 — Optional CDP recovery and endpoint availability (2026-10-31)

## Evidence / responsibility

- In isolated Queqiao-n8n V2 Execution #102, Origin resolution succeeded. A Browser Harness **Collect** call failed before site execution with `connectOverCDP: ECONNREFUSED`. The configured CDP listener was not accepting connections.
- Source-level cause: the existing CDP Browser Session only attached to an existing listener. Repeating Collect could not start a missing Chrome. The original Chrome process exit reason is **UNKNOWN**; this does not establish that a user closed it.
- This is a Browser Session connection failure, **not** ChatGPT Collect `pending`, #72 pending diagnostics, #68 missing Composer, or a post-Send failure.

## Behavior and exact configuration

**Default is unchanged attach-only.** Browser Harness never relaunches, closes, or replaces a browser opened externally, including the Chrome daily-driver or a `cdpUrl:"chrome"` debugging channel. On recognizable connection-refused errors, `harness_run collect` / `trigger` returns:

```json
{"status":"unavailable","reason":"CDP_ENDPOINT_UNAVAILABLE","endpointStatus":"absent",
 "recovery":{"mode":"attach-only","attempted":false,"outcome":"disabled"},"action":"collect"}
```

**Opt-in**, on the Browser Harness `browser` section **only**:

```json
{
  "name": "dedicated-recoverable-cdp",
  "adapter": "chatgpt",
  "browser": {
    "connection": "cdp",
    "channel": "chrome",
    "cdpUrl": "http://127.0.0.1:18985",
    "debugPort": 18985,
    "cdpRecovery": "harness-owned",
    "headless": false,
    "startMinimized": true
  }
}
```

This is an illustration, **not an instruction to modify a user's existing daily-driver CDP profile**. Actual site `adapterConfig` must still be configured. The example uses only a local loopback port and a dedicated private Harness profile. If port 18985 is already used, choose an available port and update **both** `cdpUrl` and `debugPort`. The explicit port and local URL must match. Never point this opt-in mode at a remote host, named Chrome debugging channel, URL with credentials/query/path, or an existing `userDataDir`. The configuration validator rejects these cases. **Do not switch an existing external daily-driver Chrome profile to `harness-owned`.**

After a CDP connection-refused failure, the owned recovery path:
1. Calls `http://127.0.0.1:<debugPort>/json/version`, plus an endpoint-occupancy check to distinguish a free port from a non-CDP service.
2. If valid CDP is already ready, **reattaches without launching or closing** any process. If the port is occupied by a non-CDP process, reports `endpoint_in_use`; no launch.
3. If genuinely absent, starts one Chromium-family executable using **only** the private `<Harness home>/profiles/<name>/browser-profile`, with `--remote-debugging-port`, loopback address and headless/headed flags. This process intentionally remains active after an individual Run to support further attachment.
4. Probes `/json/version` for at most 15 seconds. If ready, `connectOverCDP` is retried **once** and a new independent Run tab is opened; the same pending **read-only Collect** is then executed once. No Trigger/Send is replayed.
5. If launch, readiness or reconnect fails, returns `CDP_ENDPOINT_UNAVAILABLE` with `endpointStatus` and bounded `recovery.outcome`, never raw Playwright logs, CDP endpoint URL, browser path or account contents.

`harness_status` now reports `browserEndpoint:{status:"ready"|"absent"|"occupied"|"unknown"|"not_checked",recoveryMode:...}` for CDP profiles. Only explicit loopback HTTP endpoints are actively probed. Named debugging channels and remote endpoints remain `not_checked`. **Existing** `state.desiredStatus/observedStatus` reflect the *Harness interval supervisor*, not the Chrome process; an unexpectedly closed Chrome can coexist with supervisor status `RUNNING`.

`harness_bootstrap open/close` remain **managed-profile-only**. CDP recovery does not change bootstrap semantics. Bootstrap `close` is now explicitly blocked for all CDP profiles so an attached external Chrome cannot be closed through it. The owned recovery browser can be closed by the operator who controls that process; a later Collect can re-open it if the private profile remains valid.

## TDD and independent checks

- RED then GREEN: missing listener in attach-only, opted-in relaunch once, `/json/version` readiness, failed readiness, a running listener, port occupied by a non-CDP service, configuration invalidity, structured sanitization, and no extra tab or Send.
- `npm run check` runs TypeScript, Vitest, build, package checks, stateless runner, and a child-process **real Runner** check: synthetic missing CDP for both `collect` and `trigger` returns the structured unavailable result (not `LOCAL_ACTION_FAILED`), without a SendAttempt.
- Isolated **real Chrome** check on Windows: allocated a free ephemeral loopback port and a random temporary browser profile, observed `absent -> ready` by starting the Chrome CDP process, attached to one tab, and confirmed browser remains available after the Runner session disconnects. The test then closed **only its own** synthetic browser process and deleted the temporary profile. No ChatGPT account, user conversations or n8n were used.
- Independent WSL `npm run check` and GitHub Actions must pass for merge acceptance. Actual browser ownership/recovery of a live n8n Collect job is separate and not claimed from synthetic checks.

**Not included**: n8n retries, automatic Start of a user's external browser, reauthentication, blind Trigger resend, or automated deletion of browser login profiles. No account data is committed.
