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

## Interactive Pi Slash Commands — Agent-aware (Windows and WSL)

The extension registers **four human Slash Commands** in addition to the existing 16 model tools. `/ask-gpt`, `/ask-claude`, `/ask-grok`, and `/ask-mistral` are **Pi Agent Loop entrypoints**, not direct browser passthrough:

1. A command passes the user's natural-language request unchanged to Pi through `pi.sendUserMessage()` and notes the preferred provider/tool (`ask_chatgpt`, `ask_claude`, `ask_grok`, `ask_mistral`). This starts the *existing* Pi Agent Loop, not another planner service.
2. Pi decides if external consultation is needed based on the task and available local context. An explicit request such as “必須先詢問 ChatGPT” must be honored; the command name alone does not force a Web send. Pi should use its built-in project read/search tools to inspect relevant evidence before sending a project-specific question. Do not forward the entire repository, credentials, sensitive data or irrelevant files.
3. If consultation is performed, the **same** Ask Core, provider-pinned Orca Transport, idempotent Request Journal and read-only Collect tools are used. A pending/unknown response must not trigger another Ask. Pi continues processing the answer rather than merely displaying it. The Pi extension also enforces this at the native `tool_call` boundary: while an earlier Ask from the same provider remains `IN_FLIGHT`, `PENDING` or `UNKNOWN` **within the same user prompt**, a second Ask (including a reworded request) is blocked before execution. The hold resets at `before_agent_start` for a new user prompt and is released if Collect/Status proves the original request `COMPLETED`. Other providers and genuine independent completed consultations are unaffected. This is not a fixed one-Ask quota.
4. `/ask-gpt --collect <request_id>` (and the other three provider equivalents) is an explicitly **read-only** direct command for an existing receipt; unlike a new request, it does not start a Pi model turn. It displays the saved result with `triggerTurn:false`.

Examples:

```text
/ask-gpt 請先檢查目前專案的測試，再評估是否需要詢問 ChatGPT
/ask-claude 必須先閱讀相關程式碼，再詢問 Claude，最後整理結論
/ask-grok 請幫我分析目前的架構風險
/ask-mistral --collect <EXISTING_REQUEST_ID>
```

The command supplies the current Pi working directory only to the *local Pi Agent*. That path is not automatically forwarded externally. This relies on the actual Pi model's ability to choose and summarize context; test with real model-issued read and Ask calls, not only a synthetic ACK. Restart an already-running Pi session or use its supported reload mechanism after installing.

## Pi tool contracts

| Provider | Ask | Collect | Receipt | Readiness |
|---|---|---|---|---|
| ChatGPT | `ask_chatgpt` | `collect_chatgpt` | `chatgpt_status` | `chatgpt_readiness` |
| Claude | `ask_claude` | `collect_claude` | `claude_status` | `claude_readiness` |
| Grok | `ask_grok` | `collect_grok` | `grok_status` | `grok_readiness` |
| Mistral | `ask_mistral` | `collect_mistral` | `mistral_status` | `mistral_readiness` |

`ask_*({question,request_id?})` accepts only question plus an optional idempotency key. `collect_*({request_id})` never sends; it reads the original conversation or safely reconciles an ambiguous click. `*_status({request_id})` reads local journal only. `*_readiness({})` checks the configured page without sending. The model **cannot** select a provider's Worktree, Page ID, role, session or account through tool arguments. Cross-provider fallback is outside this scope.

State contract: `COMPLETED`, `PENDING`, `UNKNOWN`, `NOT_SENT`, `NOT_READY`, `NOT_FOUND`, `REQUEST_MISMATCH` and invalid-input errors. An exclusive request ID claim prevents duplicate sends. A process error after claim is `UNKNOWN`, never an automatic retry. Only `CLICK_OUTCOME_UNKNOWN` / `POST_CLICK_UNVERIFIED` may be reconciled by **read-only** matching of the pinned page, verified original prompt hash, canonical conversation identity and settled answer. A deterministic default request ID hashes the provider namespace and exact question. The journal records hashes, receipt IDs, URLs and answer text; it never stores the raw question.

## Completion Evidence contract — live POC, 2026-11-06

Prior behavior accepted “no Stop button and assistant text stable for 650 ms” as `COMPLETED`. This caused a real Windows Pi false-completion report while the ChatGPT Web UI was still answering. Stable text **is not a terminal signal**.

**Read-only Orca DOM + synthetic long-answer POC** (four pinned provider tabs, no user content):

| Provider | Observed while generating | Observed at end | Scoped evidence used |
|---|---|---|---|
| ChatGPT | Stop control visible; response text grew to 7,196 characters without final marker | Final marker and assistant's `重新產生回覆` appeared after generation | Latest `ChatGPT 說：` turn's action group, not a global button |
| Claude | Stop visible; Retry absent throughout streaming | Retry appeared, Stop disappeared, final marker present | Latest `[data-testid=assistant-message]` Retry |
| Grok | Stop often absent; `複製回應` appeared **before** final marker | `重新生成` appeared with terminal response | Latest assistant response group's Regenerate (not Copy) |
| Mistral | Stop often absent; Rewrite exists **during** active streaming | Read aloud appeared with final marker | Latest answer part's response group Read aloud (not Rewrite) |

**Conservative contract:** Transport only returns `completed` when the latest assistant's **provider-specific terminal action** is present, no active generation is detected, and two read-only inspections agree on the original user question, answer text and terminal action. It then returns `completionEvidence: latest-assistant-terminal-action-v1`. Core persists `COMPLETED` **only with this proof**. If the toolbar is missing or changes, the request stays `PENDING`; UI changes require a new POC.

Legacy `COMPLETED` journal entries created without evidence are surfaced as `UNKNOWN / LEGACY_COMPLETION_UNVERIFIED`, with no cached answer trusted as final. `collect_*` can **read-only** revalidate a legacy receipt if its pinned original conversation is still available; it must never resend the question. A navigation to a different conversation leaves the old receipt unverified instead of manufacturing completion. Existing worktrees, tabs, private IDs, browser profiles, and secrets remain outside Git.

These site-specific DOM cues are supported by the observed POC, **not a guaranteed future Web UI contract**. Subsequent site changes must fail closed, with test updates based on fresh DOM evidence. Neither a fixed delay alone nor an older message's toolbar is sufficient.

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

Install using `node pi/install.mjs`; it copies `index.ts`, `web-ask-core.mjs`, compatibility `chatgpt-core.mjs`, `orca-cli.mjs`, `web-providers.mjs`, `completion-evidence.mjs`, `commands.mjs`, `agent-send-guard.mjs`, and local TypeBox dependencies to `~/.pi/agent/extensions/queqiao-chatgpt/`. The installer only removes a known-signature legacy Windows Runner module, never an unrelated file. Pi discovers the installed tools on startup. The installation does not create, close or switch Orca tabs.

## Browser isolation and data safety

- Every Orca operation is pinned to **both** an existing worktree and the exact provider Page ID. `tab list` confirms the page's worktree, allowed hostname, home/conversation route and permitted query parameters before any further operation.
- `fill`, `click`, `keypress` and `goto` use `--page`, `--worktree`, and `--expect-url`. Read-only `eval` can inspect the exact matching tab but cannot send/click through DOM JavaScript. `tab close`, `tab create`, `tab switch`, browser profile mutation, session cloning and Orca shutdown are not permitted.
- Only the selected page may navigate back to its own provider's new-chat URL, and only after checking for existing drafts and active generation. Because URL navigation can complete before the new Composer hydrates, a bounded **read-only empty-editor check** follows navigation. An occupied draft causes `NOT_SENT`, not overwriting other content.
- Each provider uses an explicit original-message selector and response-body selector. Claude's Send button and filled editor text can appear after React updates; only **bounded read-only reinspection** is permitted, never a second `fill` or attempted send. Grok and Mistral use one `Enter` submission after verifying the filled editor. ChatGPT and Claude use a verified named Send button. For ChatGPT, the actual composer form must expose a visible, enabled `type=submit` control across **two read-only observations** after exact draft verification; an unready form results in `NOT_SENT` without clicking. No automatic post-click retry is allowed.
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

**ChatGPT Round 1 forced-consult Retro (2026-11-06):** the initial Windows forced-consult E2E was blocked by `POST_CLICK_UNVERIFIED` and a subsequent small-model attempt to issue a second Ask. A pre-send form readiness check and a per-user-prompt native Pi unresolved-send guard have been added with TDD. Follow-up **Windows 3/3** and **WSL 2/2** synthetic forced-consult E2Es observed Read → one Ask → read-only Collect → `COMPLETED` with exact ACK and durable UI completion proof. The underlying intermittent Orca no-op has not been proven impossible; these fixes are a targeted conservative mitigation plus explicit duplicate-send prevention. See [PI_R1_WINDOWS_FORCED_CONSULT_RETRO_20261106.md](PI_R1_WINDOWS_FORCED_CONSULT_RETRO_20261106.md).

**Final E2E Round 2/4 — Claude (2026-11-06):** Initially BLOCKED by an existing unsent draft, then **PASS in both Windows and WSL** after user-authorized draft clearance, TDD repair of Claude multi-paragraph prompt integrity, and strict synthetic project-context E2E. A Windows ACK-only test omitted project context and was correctly rejected; a later test required Claude to return a ProjectTag that was present only in the synthetic project file, and passed on both platforms. See [original evidence](PI_FINAL_E2E_R2_CLAUDE_20261106.md) and [authorized retest / Retro](PI_R2_CLAUDE_AUTHORIZED_RETRO_20261106.md).

**Final E2E Round 3/4 — Grok (2026-11-06): PASS on Windows and WSL.** Both actual Pi Agents first read synthetic project evidence, sent one `ask_grok` containing the file-derived ProjectTag and Goal, then received the exact ProjectTag with durable `COMPLETED` proof. An initial `NOT_SENT / PROMPT_INTEGRITY_FAILED` exposed Grok ProseMirror `<p>` newline expansion; two RED→GREEN tests and a provider-scoped text reconstruction fixed the false negative without weakening prompt verification. See [Round 3 Grok E2E and Retro](PI_FINAL_E2E_R3_GROK_20261106.md).

## Windows Pi (Queqiao `pc-worker`) local installation

The same extension is installed into **Windows Pi** separately, without npm publication or GitHub Release. Windows Pi has its own user-local `~/.pi/agent/extensions/queqiao-chatgpt` directory and local configuration; it does not load WSL Pi files automatically. The local installer detects Windows (`cmd.exe` for the fixed npm install command) and copies the same runtime modules, including `commands.mjs`. The Windows Pi process invokes the installed **native Windows Orca CLI executable** rather than `orca-ide` from WSL.

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
