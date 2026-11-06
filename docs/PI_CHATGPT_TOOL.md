# WSL Pi → ChatGPT via Orca CLI

## Contract and runtime

The optional standalone Pi Extension exposes `ask_chatgpt`, `collect_chatgpt`, `chatgpt_status`, and `chatgpt_readiness`. It uses the installed **Orca CLI**, **not Browser Harness** or the Windows Runner. The separate n8n 9B Pi Workers still launch with `--no-extensions`, so they do not gain these tools.

```text
Standalone Pi Coding Agent
  → extension.mjs (local configuration; no model-selected worktree or page)
  → chatgpt-core.mjs (local durable request journal; one original send per request ID)
  → orca-cli.mjs (WSL Orca CLI; page-bound tab/list, snapshot, eval, fill, click)
  → explicitly pinned ChatGPT page in the existing Orca worktree
```

Orca's browser is separate from Chrome/CDP Browser Harness. No new browser profile, login, tab, worktree, or daemon is created by the tool.

## Local setup

Requires WSL2 with a working `orca-ide` executable, an authenticated existing ChatGPT tab in Orca, and Pi 0.85.1+. Check the target with `orca-ide tab list --worktree all --json`. Set a **stable exact worktree `id:` selector and `browserPageId`** from the result (never `active`). Keep this configuration outside the repository at `~/.config/queqiao/pi-chatgpt.json` with mode `0600`:

```json
{
  "profile": "standalone-pi-orca",
  "cli": "/home/<WSL_USER>/.local/bin/orca-ide",
  "worktree": "id:<ORCA_WORKTREE_ID>",
  "pageId": "<EXISTING_CHATGPT_BROWSER_PAGE_UUID>",
  "stateDir": "/home/<WSL_USER>/.local/state/queqiao/pi-chatgpt",
  "lockFile": "/home/<WSL_USER>/.local/state/queqiao/pi-chatgpt/orca-cli.lock"
}
```

`profile` is only a **local journal namespace**, not an Orca/Browser Harness profile. Prefer an **absolute** `cli` executable path: noninteractive jobs can have a different PATH from the WSL shell. The lock is dedicated to this Pi Orca tool, not the Browser Harness CDP lock. The directory for `lockFile` must exist.

Install locally with `node pi/install.mjs`. The installer removes the tool-owned legacy `windows-runner.mjs` only when its known signature matches. This installs `index.ts`, `chatgpt-core.mjs`, `orca-cli.mjs` and TypeBox into `~/.pi/agent/extensions/queqiao-chatgpt/`; it does not mutate existing Orca sessions. For a one-off load use `pi --extension /absolute/path/to/pi/extension.mjs`.

## Isolation and safety

- The transport finds the exact `pageId` **within the fixed worktree** on every operation, verifies `chatgpt.com` origin and supported URL, and refuses mismatched/missing targets. It never falls back to a global active tab.
- Only `tab list`, `snapshot`, read-only `eval`, `fill`, `click` and, when necessary, `goto` are called. Every page operation is bound to `--worktree` and `--page`; fill, click and navigation also use `--expect-url`.
- `goto` can navigate **only the pinned ChatGPT page** to the home page to start another conversation, after checking that no draft exists or generation is active. The tool never invokes `tab close`, `tab switch`, `tab create`, profile changes, or app shutdown. It never accesses another model's tab.
- Each request is claimed exclusively before any possible send. After clicking, the CLI may report a navigation error **even when the message was sent**. Only a **read-only** reinspection of the same pinned page, exact original prompt SHA-256, and canonical conversation URL may reconcile this outcome. **Never click again, automatically resend, or switch to another conversation.**
- The journal contains request IDs, hashes, verified conversation URLs/IDs, states and collected answer text, **never the raw question**. Local records are mode `0600` in a mode `0700` directory.
- Orca's `fill --value` currently places the prompt in an operating-system process argument; unlike the previous stdin-based Runner, this does not conceal it from same-host process inspection. **Do not send secrets, tokens, passwords or personal data through this tool.** The Pi Tool does not expose worktree/page selection to model arguments.

## Results and durable states

- `ask_chatgpt({question,request_id?})`: starts one **new conversation in the designated page**, submits exactly once and attempts collection. A default request ID is a deterministic hash; use a distinct explicit ID to intentionally repeat an identical question.
- `collect_chatgpt({request_id})`: reads only the original recorded conversation, never resends. For explicit post-click ambiguity (`CLICK_OUTCOME_UNKNOWN` or `POST_CLICK_UNVERIFIED`), it may perform a **read-only** original-question-hash reconciliation before collecting.
- `chatgpt_status({request_id})`: local journal read, no browser action.
- `chatgpt_readiness({})`: verifies exact Orca target and accessibility textbox; this is not a send receipt.

Statuses: `COMPLETED` (answer from exact conversation), `PENDING` (send proved, answer not yet settled), `UNKNOWN` (post-click outcome unverified; **do not retry `ask` with that ID**), `NOT_SENT` (verified pre-send stop), `NOT_READY`, `REQUEST_MISMATCH`, `NOT_FOUND` and invalid-input errors. Collection verifies the original prompt hash, canonical `chatgpt.com/c/<uuid>` and stable assistant answer over two observations. ChatGPT UI markup is site-controlled and must be verified after upstream changes.

## Verification

Run `npm run test:pi` and `npm run check`. The existing GitHub Actions CI executes `npm run check`, including the Pi tests. Tests cover immutable worktree/page binding, empty/draft preconditions, exactly-once click, post-click read-only recovery, original question/answer correlation, no tab-close/switch calls, Pi tool schema, installation and durable idempotency. CI uses only synthetic data and never depends on a logged-in browser.

**Live acceptance (2026-11-06):** The target Orca worktree was the user-provisioned `pi-usage` workspace with four existing provider tabs (ChatGPT, Claude, Grok, Mistral). A real `ask` operation on its pinned ChatGPT tab submitted a synthetic question and received an exact acknowledgment. The first receipt was `UNKNOWN` because current ChatGPT messages use localized accessible headings (`你說：` / `ChatGPT 說：`), not the older `data-message-author-role` selector. A second distinct synthetic send also reached ChatGPT despite an Orca click/navigation race; **read-only** question-hash verification and `collect` recovered the original conversation and returned `COMPLETED` with the exact acknowledgment. In both runs, before/after global Orca page-ID sets were identical and all other tab URLs stayed unchanged. The global count may vary when other Orca users independently create tabs; compare sets **within each individual run**, not to a hardcoded count. A subsequent **native Pi model-issued E2E** invoked installed `ask_chatgpt` (`PENDING`) and then `collect_chatgpt` (`COMPLETED`) in the same Pi agent run. The collected answer exactly matched the synthetic acknowledgment, and the Pi process exited with code `0`.

A live `COMPLETED` acknowledgment is required before merging the Pi integration PR. Successful snapshots alone, an unknown click state, or unit tests alone do not satisfy this gate.
