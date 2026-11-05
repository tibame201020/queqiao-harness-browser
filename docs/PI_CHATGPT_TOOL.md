# WSL Pi → ChatGPT through existing Browser Harness

## Scope and implementation

The optional Pi Extension (`pi/extension.mjs`) exposes `ask_chatgpt`, `collect_chatgpt`, `chatgpt_status`, and `chatgpt_readiness` to **standalone WSL Pi Coding Agent**. It is not enabled for the n8n sandboxed 9B coding Workers; those continue to launch Pi with `--no-extensions` and their explicit local-tool allowlist.

```text
Pi Tool Call
  -> extension.mjs (fixed local configuration, no model-selected profile)
  -> chatgpt-core.mjs (local durable receipt, one trigger per request_id)
  -> windows-runner.mjs (WSL PowerShell interop, STDIN payload)
  -> preinstalled Windows Browser Harness Runner (status / run trigger / run collect)
  -> original authenticated ChatGPT UI
```

No second Browser automation engine, Paperclip agent identity, finance role, ChatGPT API key, or new shared daemon is involved. Browser Harness owns browser/CDP, original one-click submission, project/conversation identity, and answer collection. This Pi adapter **does not** alter Harness DOM logic.

## Setup (operator; local files only)

Requires WSL2 with Windows interop, Pi 0.85.1+, installed Windows Browser Harness Runner, an existing authenticated Browser Harness Chrome session, and a dedicated manual ChatGPT Harness profile. Create a dedicated profile from a trusted pre-provisioned Browser Harness configuration; use `adapter: chatgpt`, `schedule.type: manual`, `adapterConfig.project.enabled: false`, `adapterConfig.conversation.newChatEachRun: true`. For CDP attach-only, the configured endpoint must report `ready` before send. Do not copy browser cookies or private Chrome profiles across OS boundaries.

Store the following JSON in `~/.config/queqiao/pi-chatgpt.json` (mode `0600`, **outside Git**); replace all placeholder paths with actual local values:

```json
{
  "runnerPath": "C:\\<WIN_USER>\\Documents\\...\\dist\\runner.js",
  "profile": "pi-general-chatgpt",
  "stateDir": "/home/<WSL_USER>/.local/state/queqiao/pi-chatgpt",
  "lockFile": "/home/<WSL_USER>/.../shared-browser-harness.lock"
}
```

`lockFile` must be the same WSL `flock` lock already used by other Browser Harness WSL users when sharing one browser. Never create an additional browser controller. To install the optional global Pi extension in your own WSL account, run from this repository or its installed npm package:

```bash
node pi/install.mjs
```

This copies the three runtime modules to `~/.pi/agent/extensions/queqiao-chatgpt/`, exposes an auto-discovered `index.ts`, and installs `typebox` beside it. Pi picks it up at startup, with no modification to existing Pi model/provider config. For an isolated test without installation, use `pi --extension /absolute/path/to/pi/extension.mjs`. The tool loads private configuration lazily on first invocation.

## Tools and durable states

- `ask_chatgpt({question, request_id?})`: one original `trigger`, then first `collect`. Returns `COMPLETED` and `answer`, `PENDING`, `UNKNOWN`, `NOT_SENT`, or `NOT_READY`. When `request_id` is omitted, the profile and exact question are hashed for a deterministic private request key; use a new explicit request ID for an intentionally repeated identical question.
- `collect_chatgpt({request_id})`: **read-only** continuation for the original saved conversation identity; a pending read may be repeated. It never submits another prompt.
- `chatgpt_status({request_id})`: reads the local journal only, with no Windows Browser operation.
- `chatgpt_readiness({})`: checks profile configuration and CDP endpoint (if CDP). This is not proof of ChatGPT's authenticated composer readiness; Browser Harness performs that check before sending.

The journal is local-only (`0600` files under a `0700` directory). It persists question hashes, request IDs, original conversation IDs/URLs, send state and answers; it never persists question text. On a crash, failure, timeout, or ambiguous reply **after the exclusive trigger claim**, the request remains `UNKNOWN` and is never blindly resent. A verified Browser Harness `submissionState: not_sent` is `NOT_SENT`, not a successful interaction. A completed answer is accepted only after the Runner's `collect` returns the same conversation ID and a canonical `chatgpt.com` URL.

Private content, credentials, local profile configurations, ChatGPT conversation URLs, user names and receipts must never be committed. CI uses synthetic mock Windows Runner receipts; live E2E uses a synthetic acknowledgment with the operator's existing authenticated Browser Harness profile.

## Acceptance

Run `npm run test:pi` and `npm run check`. The repository's existing `.github/workflows/ci.yml` calls `npm run check`, so the new Pi unit suite runs on every push/PR. The deployment acceptance requires a real Pi Extension load plus one synthetic `ask_chatgpt` call returning an exact ChatGPT acknowledgment from the original saved conversation. A successful read-only status check or an explicit `NOT_SENT` does **not** pass that E2E gate.

**2026-11-05 local probe:** WSL → installed Windows Runner `status` succeeded and the dedicated attach-only CDP profile reported `ready`. One synthetic Browser `trigger` was attempted; Runner returned `PRE_SEND_NOT_READY` (`precomposeReason: composer_absent`, zero composer matches). Durable Pi receipt correctly reported `NOT_SENT`; no question was submitted and no end-to-end answer was verified. This reflects the existing Browser Harness Composer readiness issue, not evidence that the Pi tool's ask/collect path has passed. Do not merge or claim complete live acceptance solely on these unit tests.
