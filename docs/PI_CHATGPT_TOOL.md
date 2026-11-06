# WSL Pi → four Web Chat Providers through Orca CLI

## Architecture

The optional, standalone Pi Coding Agent extension exposes four explicit Ask tools, with a **single shared request/receipt state machine**. Provider-specific Web implementations are local rules, not four copies of the send/journal logic:

```text
Pi ask_chatgpt | ask_claude | ask_grok | ask_mistral
    ↓
extension.mjs → web-ask-core.mjs / createWebAskTool (shared state machine)
    ↓
web-providers.mjs (origin, conversation route, editor, submit, message body)
    ↓
orca-cli.mjs (pinned worktree and page, read-only recovery, exactly one send)
    ↓
Existing authenticated Orca pi-usage browser tabs (one per provider)
```

The original `chatgpt-core.mjs` remains a minimal compatibility re-export. The old `createChatGptTool` factory is an alias to the shared `createWebAskTool({provider:'chatgpt'})`; historical ChatGPT local receipts retain their namespace. This extension **does not use Browser Harness**, change browser profiles, or install into n8n's separate 9B Workers, which still launch with `--no-extensions`.

## Pi tool contracts

| Provider | Ask | Collect | Receipt | Readiness |
|---|---|---|---|---|
| ChatGPT | `ask_chatgpt` | `collect_chatgpt` | `chatgpt_status` | `chatgpt_readiness` |
| Claude | `ask_claude` | `collect_claude` | `claude_status` | `claude_readiness` |
| Grok | `ask_grok` | `collect_grok` | `grok_status` | `grok_readiness` |
| Mistral | `ask_mistral` | `collect_mistral` | `mistral_status` | `mistral_readiness` |

`ask_*({question,request_id?})` accepts only question plus an optional idempotency key. `collect_*({request_id})` never sends; it reads the original conversation or safely reconciles an ambiguous click. `*_status({request_id})` reads local journal only. `*_readiness({})` checks the configured page without sending. The model **cannot** select a provider's Worktree, Page ID, role, session or account through tool arguments. Cross-provider fallback is outside this scope.

State contract: `COMPLETED`, `PENDING`, `UNKNOWN`, `NOT_SENT`, `NOT_READY`, `NOT_FOUND`, `REQUEST_MISMATCH` and invalid-input errors. An exclusive request ID claim prevents duplicate sends. A process error after claim is `UNKNOWN`, never an automatic retry. Only `CLICK_OUTCOME_UNKNOWN` / `POST_CLICK_UNVERIFIED` may be reconciled by **read-only** matching of the pinned page, verified original prompt hash, canonical conversation identity and settled answer. A deterministic default request ID hashes the provider namespace and exact question. The journal records hashes, receipt IDs, URLs and answer text; it never stores the raw question.

## Local setup (operator; never commit)

Requires WSL2 + Pi 0.85.1+, installed `orca-ide`, four already authenticated site tabs in an existing Orca Worktree. Discover the **stable** `worktreeId` and `browserPageId` using `orca-ide tab list --worktree all --json`. Never use an `active` page selector. Keep this file outside Git at `~/.config/queqiao/pi-chatgpt.json`, mode `0600`:

```json
{
  "profile": "pi-web-standalone",
  "cli": "/home/<WSL_USER>/.local/bin/orca-ide",
  "stateDir": "/home/<WSL_USER>/.local/state/queqiao/pi-web",
  "lockFile": "/home/<WSL_USER>/.local/state/queqiao/pi-web/orca-cli.lock",
  "providers": {
    "chatgpt": {"worktree": "id:<EXISTING_ORCA_WORKTREE_ID>", "pageId": "<CHATGPT_PAGE_UUID>"},
    "claude": {"worktree": "id:<EXISTING_ORCA_WORKTREE_ID>", "pageId": "<CLAUDE_PAGE_UUID>"},
    "grok": {"worktree": "id:<EXISTING_ORCA_WORKTREE_ID>", "pageId": "<GROK_PAGE_UUID>"},
    "mistral": {"worktree": "id:<EXISTING_ORCA_WORKTREE_ID>", "pageId": "<MISTRAL_PAGE_UUID>"}
  }
}
```

An existing old ChatGPT-only configuration with top-level `worktree`/`pageId` still works for ChatGPT. New providers require their explicit `providers[provider]` entry. `profile` denotes only a **journal namespace**, not an Orca browser profile. Use an absolute `cli` path, since noninteractive Pi/Queqiao jobs may not load a shell PATH. Ensure the lock's parent directory exists. The same lock across providers serializes mutable operations.

Install using `node pi/install.mjs`; it copies `index.ts`, `web-ask-core.mjs`, compatibility `chatgpt-core.mjs`, `orca-cli.mjs`, `web-providers.mjs`, and local TypeBox dependencies to `~/.pi/agent/extensions/queqiao-chatgpt/`. The installer only removes a known-signature legacy Windows Runner module, never an unrelated file. Pi discovers the installed tools on startup. The installation does not create, close or switch Orca tabs.

## Browser isolation and data safety

- Every Orca operation is pinned to **both** an existing worktree and the exact provider Page ID. `tab list` confirms the page's worktree, allowed hostname, home/conversation route and permitted query parameters before any further operation.
- `fill`, `click`, `keypress` and `goto` use `--page`, `--worktree`, and `--expect-url`. Read-only `eval` can inspect the exact matching tab but cannot send/click through DOM JavaScript. `tab close`, `tab create`, `tab switch`, browser profile mutation, session cloning and Orca shutdown are not permitted.
- Only the selected page may navigate back to its own provider's new-chat URL, and only after checking for existing drafts and active generation. Because URL navigation can complete before the new Composer hydrates, a bounded **read-only empty-editor check** follows navigation. An occupied draft causes `NOT_SENT`, not overwriting other content.
- Each provider uses an explicit original-message selector and response-body selector. Claude's Send button and filled editor text can appear after React updates; only **bounded read-only reinspection** is permitted, never a second `fill` or attempted send. Grok and Mistral use one `Enter` submission after verifying the filled editor. ChatGPT and Claude use a verified named Send button.
- New Grok conversations have been observed with `?rid=<UUID>`; only that sole, valid parameter is allowed for Grok, and the saved receipt is canonicalized to `grok.com/c/<UUID>` without query. Other unexpected query parameters, hosts, routes or cross-provider collect results are rejected.
- Prompt text is passed to Orca CLI as the `fill --value` process argument. On a shared host another process with sufficient access may observe command arguments. **Do not transmit secrets, credentials, private user information or confidential content through these tools.** Keep journal files mode `0600` in mode `0700` directories and never commit local URLs, prompts, browser/identity data or credentials.

## Tests and live acceptance

Run `npm run test:pi` and `npm run check`. `.github/workflows/ci.yml` executes the full `npm run check` on Ubuntu and a separate `pi-windows` job (`npm run test:pi` with Node 24) on Windows. Both are synthetic and require no browser credentials. Unit tests use synthetic only: original-hash identity, cross-provider namespace separation, correct URL grammar, isolated page IDs, allowed CLI actions, site-specific editor/send/read selectors, read-only recovery, stale send control, package contents, and Pi public-tool schemas. `npm pack --dry-run` must include `pi/web-providers.mjs` and exclude the old Windows Runner.

**Real site checks, 2026-11-06** — all targeted the user-provisioned `pi-usage` worktree and existing provider tabs:

| Provider | Observed behavior | Site-level result |
|---|---|---|
| ChatGPT | Localized `你說：/ChatGPT 說：` headings; click/navigation races | `COMPLETED` with exact synthetic ACK (previous PR #78 E2E) |
| Claude | ProseMirror `textbox`; delayed Send control; response card includes a toolbar | `COMPLETED` with exact synthetic ACK; initial `NOT_SENT` draft safely cleared |
| Grok | ProseMirror `combobox`; one Enter; `?rid` URL; role headers surround message bodies | Read-only recovery of original send → `COMPLETED`, exact ACK |
| Mistral | Generic editable `ProseMirror`; one Enter; user bubble lacks `data-testid` | Read-only recovery of original send → `COMPLETED`, exact ACK |

On each separate site E2E, global Orca Page ID sets were identical before/after, other tab URLs did not change, and **no browser tabs were closed**. The global tab count can change *between* runs due to unrelated user activity; do not compare against one historical count.

**Native Pi model-issued E2E (2026-11-06):** standalone Pi Coding Agent invoked the real installed tools, without mock transports, and received exact synthetic acknowledgments. Claude: one `ask_claude` → `COMPLETED`; Grok: one `ask_grok` → `COMPLETED`; Mistral: `ask_mistral` → `PENDING`, then `collect_mistral` → `COMPLETED`. Every Pi process exited with code `0`. An earlier native ChatGPT test also completed `ask_chatgpt` + `collect_chatgpt` with exact ACK. None needed a duplicate send or cross-provider fallback.

Site DOM may change; new upstream selectors require fresh verification rather than speculative fixes. The final delivery gate also requires a fresh `npm run check`, installed-package verification, successful GitHub Actions CI on the actual commit, and independent code review before merge.

## Windows Pi (Queqiao `pc-worker`) local installation

The same extension is installed into **Windows Pi** separately, without npm publication or GitHub Release. Windows Pi has its own user-local `~/.pi/agent/extensions/queqiao-chatgpt` directory and local configuration; it does not load WSL Pi files automatically. The local installer detects Windows (`cmd.exe` for the fixed npm install command) and copies the same runtime modules. The Windows Pi process invokes the installed **native Windows Orca CLI executable** rather than `orca-ide` from WSL.

Use a user-local Windows config under `%USERPROFILE%\.config\queqiao\pi-chatgpt.json`. Set `cli` to the local native Orca CLI `.exe`, `stateDir` to a private Windows user directory, and `providers[provider]` to the existing `pi-usage` worktree and exact provider page IDs. Never commit this config or real IDs. Windows filesystem permissions use inherited user-profile ACLs rather than POSIX `0600` bits.

**Shared lock:** Windows and WSL Pi instances point `lockFile` to the **same physical NTFS directory** (`C:\...\pi-web-ask.lockdir` and `/mnt/c/.../pi-web-ask.lockdir`, respectively). The extension uses an atomic `mkdir`-based lock across operating systems. An existing directory causes contention and a bounded timeout; it is **never automatically removed as stale**. After a crash, verify no live holder or ambiguous send before manually reconciling the directory. Existing browser tabs and the other Pi extensions remain untouched. **Important:** Windows and WSL have separate local journal namespaces/state directories; the shared lock serializes operations, but does not provide cross-instance request-ID deduplication.

**Windows CLI Unicode rule:** Windows PowerShell 5.1 can incorrectly decode native Orca CLI UTF-8 JSON on a pipe, silently corrupting Unicode `worktreeId` values. The resulting `id:` selector fails safely as `selector_not_found`. Read Orca JSON through Node.js `child_process.spawn` (UTF-8) or another verified UTF-8-safe decoder, and keep the exact `id:` selector + pinned Page ID. Never weaken this to `active`.

**Windows and WSL real installation/acceptance (2026-11-06):**

| Verification | Windows `pc-worker` | WSL Pi |
|---|---|---|
| Pi installation | Pi 1.5.0 user-local Extension | Independent WSL installation retained |
| Orca CLI | Native Windows CLI 1.4.249 | WSL Orca CLI bridge |
| Pi tool registration | 16/16 tools registered; four readiness checks `READY` | Four pinned Provider pages `READY` |
| Native Pi tests | 49/49 PASS on Windows Node 24 | 49/49 PASS on Linux Node 22 |
| Other extensions | Three existing Orca Pi Extension file hashes unchanged | Existing separate WSL Pi installation remains |
| Orca browser | Original four `pi-usage` provider tabs retained, no close/create/switch | Same dedicated Worktree; shared atomic NTFS lock |

**Actual Windows Pi model-issued E2E:** The installed Windows Pi (not a test mock) called the provider's Ask tool **exactly once** with a synthetic question; answer receipts were checked against the exact expected ACK.

| Provider | Observed native tool sequence | Final outcome |
|---|---|---|
| ChatGPT | `ask_chatgpt` → `PENDING`, initial `collect_chatgpt` → `PENDING`; later read-only `collect_chatgpt` | `COMPLETED`, exact ACK |
| Claude | First `NOT_SENT / PROMPT_INTEGRITY_FAILED` stopped pre-send; verified/cleared the tool-owned synthetic draft, fixed React draft timing using TDD; new request `ask_claude` | `COMPLETED`, exact ACK |
| Grok | `ask_grok` → `PENDING`; later read-only `collect_grok` | `COMPLETED`, exact ACK |
| Mistral | First `NOT_SENT / COMPOSER_NOT_EMPTY` stopped pre-send after New Chat navigation; bounded hydration check added; new `ask_mistral` → `PENDING` then read-only collect; additional **conversation → New Chat** native regression run | `COMPLETED`, exact ACK on both successful requests |

Every successful native Pi agent process exited `0`, and each site's E2E preserved the global Orca Page ID set and all other tab URLs. Ambiguous or pending requests were never resent. Cross-OS lock acquisition was physically tested: Windows observed and rejected a second lock on a directory created by WSL, then released it without affecting any browser page.

No package publication, release, change to n8n's `--no-extensions` Workers, merge, or new Orca profile was performed. A Draft PR and CI evidence are maintained for review.
