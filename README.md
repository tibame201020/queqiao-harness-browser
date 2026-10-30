# Queqiao Harness Browser

## Collect pending diagnostics (Issue #72)

ChatGPT `collect` returns `status: "pending"` with `partialText` when it cannot establish a stable Assistant response before `timeoutMs`. The optional non-content `diagnostic` describes its last observed condition, not a proven underlying cause: `pendingReason` (`NO_ASSISTANT_MESSAGE`, `EMPTY_ASSISTANT_TEXT`, `GENERATION_ACTIVE`, `UNSTABLE_MESSAGE_COUNT`, `UNSTABLE_TEXT`, `SETTLE_WINDOW_NOT_MET`), `assistantCount`, `hasText`, `generating`, `elapsedMs`, `timeoutMs`, `settleMs`, `stablePasses`, and `stableDurationMs`.

Opt-in `collect` input: `diagnostics: { "captureOnPending": true }` (default false). On `pending`, the Runner captures the actual Run-owned page before closing it. Only `diagnostic.failureScreenshot: {status:"saved",file:"collect-pending-<UUID>.png"}` or `{status:"capture_failed"}` is returned. Bytes are stored in the Harness profile's private `private-diagnostics/` directory with restricted creation permissions, never transmitted as standard JSON. Files may contain conversation/account data: inspect locally and manually remove them when no longer needed. A capture error never changes the Collect outcome. Each CDP Run opens an independent tab; actual concurrency behavior beyond this lifecycle is environment-dependent.


Worker-side browser harness runtime for Queqiao. The core owns browser/profile lifecycle, scheduling and state; site behavior lives in adapters. Queqiao/MCP business logic is not embedded in harness profiles.

## Mental model

- **Core runtime**: profile init, headed bootstrap, headless run, browser lifecycle, state, lease and interval supervisor.
- **Adapter**: site-specific behavior. Built-ins: `generic`, `chatgpt`, `claude`, `mistral`, `grok`.
- **Task rules**: remain in adapter config, target-site data sources and trigger prompts.

All four chat providers implement the original `HarnessAdapter` interface (`id`, `bootstrapUrl`, `validateConfig`, `execute`) through one built-in `AdapterRegistry` and the same profile/BrowserSession/Runner lifecycle. Their shared actions are `trigger` and `collect`; Claude, Mistral and Grok also expose provider-specific readiness `status`. ChatGPT-only Project listing, cleanup and plugin selection remain optional site capabilities, not requirements imposed on other providers. The `harness_execute` compiler selects the provider and returns the existing common execution envelope; ChatGPT's low-level `collect` remains available through `harness_run`. Trigger lease and ambiguous-send handling rely on observed result state, not hardcoded provider IDs; an ambiguous result cannot be retriggered without explicit reconciliation. Provider code owns DOM, connector UI and conversation routing. This is a Browser Harness contract only; it has no external orchestrator or custom-adapter dependency.

Chromium-family browsers are supported today (`chrome`, `edge`, `brave`, `chromium`). Firefox can be added behind the browser-driver boundary later.

## Public tools

| Tool | Purpose |
|---|---|
| `harness_execute` | Preferred LLM-facing entrypoint: validate/compile/execute a resolved script |
| `harness_init` | Low-level create/update a profile |
| `harness_list` | List profiles |
| `harness_overview` | Read reconciled progress for all profiles |
| `harness_bootstrap` | Open/close a headed profile for first login/MFA |
| `harness_run` | Run one adapter action |
| `harness_start` | Start interval supervisor |
| `harness_status` | Read config/runtime state |
| `harness_stop` | Stop supervisor without deleting profile/login state |

Runtime data is stored outside the repository. Browser profiles, cookies, tokens, user project names and conversation IDs must never be committed.

## Execution script contract

`harness_execute` is the planner-facing contract. The LLM may reason or clarify with the user however it chooses; the harness only accepts a fully resolved script. It does not implement a questionnaire or natural-language planner. Invalid scripts return a machine-readable `rejected` result (`SCRIPT_INVALID`, `SCRIPT_UNSUPPORTED`, or `SCRIPT_AUTH_REQUIRED`).

One-shot executions reuse an adapter-level browser identity so changing a prompt does not force a new login profile. Interval executions require a stable `execution.id`; executing a new interval script with the same id replaces the running supervisor so the new script takes effect immediately.

Generic one-shot:

```json
{
  "version": "1",
  "execution": { "mode": "once" },
  "task": {
    "adapter": "generic",
    "action": "open",
    "input": { "url": "https://example.com" }
  }
}
```

ChatGPT Project trigger:

```json
{
  "version": "1",
  "execution": { "mode": "once" },
  "task": {
    "adapter": "chatgpt",
    "action": "trigger",
    "target": {
      "project": { "mode": "existing", "name": "Example Project" },
      "conversation": { "mode": "new" }
    },
    "input": { "prompt": "Run one round." }
  }
}
```

For `chatgpt.cleanup` with `input.apply=true`, the script must also include `"authorization": { "destructive": true }`. Cleanup remains one-shot only.

## Browser lifecycle

`init -> bootstrap (headed, when login is needed) -> run/start (headless or headed-minimized) -> browser closes after each managed action`.

The persistent user-data directory remains, so login state survives browser shutdown. `bootstrap` is repeatable when a site requires re-authentication. Managed runs use `browser.headless`; when it is `false`, `browser.startMinimized=true` keeps the runtime browser minimized. ChatGPT has challenged both headless and managed persistent-context automation in live verification. A headed browser opened for the persisted login profile and accessed through an explicit CDP profile completed the trigger/collect POC successfully; do not assume managed mode is sufficient when ChatGPT presents an anti-bot challenge.

## ChatGPT adapter contract

All ChatGPT behaviors are opt-in and independent:

```json
{
  "name": "example-chatgpt",
  "adapter": "chatgpt",
  "defaultAction": "trigger",
  "browser": {
    "engine": "chromium",
    "channel": "chrome",
    "headless": false,
    "startMinimized": true,
    "connection": "managed"
  },
  "schedule": { "type": "manual" },
  "runPolicy": { "leaseMinutes": 50, "busyRetryMinutes": 5 },
  "adapterConfig": {
    "project": {
      "enabled": true,
      "name": "Example Project",
      "requiredSourceName": "Rules"
    },
    "conversation": {
      "newChatEachRun": true
    },
    "cleanup": {
      "enabled": false
    },
    "trigger": {
      "prompt": "Run one round."
    }
  }
}
```

### Optional behavior

- `project.enabled=false` -> use normal ChatGPT, no Project required.
- `project.enabled=true` -> `project.name` is required.
- Project navigation follows the current authenticated first-party Projects grid
  (`[data-projects-rows] [data-project-row]`) with legacy grid compatibility.
  The Project new-chat preflight uniquely matches its sidebar name and validates
  the UI-owned Project ID before opening the canonical first-party Project
  landing route; a visible, editable Composer is mandatory before Send.
  Missing/duplicate Projects, unsafe IDs, unexpected routes and unhydrated UI
  fail closed without blind retry. See `ISSUE51_PROJECT_UI_ACCEPTANCE_20261029.md`.
- `conversation.newChatEachRun=true` -> create a new chat for each trigger.
- During the first Project Send, a provisional `local-chatgpt` URL is never treated as a saved Conversation. Only a uniquely verified matching User Turn in the same pre-click Project may use the existing bounded save-grace; canonical Project Conversation identity remains mandatory. See `ISSUE53_PROJECT_PROVISIONAL_INVESTIGATION_20261030.md`.
- `conversation.newChatEachRun=false` -> `conversation.conversationId` is required and reused.
- `harness_run({name,action:"resolve_targets",args:{urls:[...]}})` validates up to 128 Browser-connector-visible URL candidates without reading conversation content, opening a Browser Session, navigating a page or mutating Runner state. It returns up to 16 canonical `{conversationId,conversationUrl}` records, or `unresolved` if there are no candidates, too many, or conflicting identities. Keep returned URLs private; callers must not interpret the ChatGPT URL grammar.
- `conversation.allowRuntimeTarget=true` -> explicit opt-in for a **per-run Trigger** with both `args.conversationId` and exact `args.conversationUrl=https://chatgpt.com/c/<id>` or `https://chatgpt.com/g/g-p-<project-id>/c/<id>`. Disabled by default. Only supported with non-Project, no-cleanup, new-chat profiles and no Plugin selection; validates identity before touching the browser. Intended for n8n's private return-target binding. Never use a model-authored URL as the destination. The profile configuration is not changed by one-off reuse.
- `cleanup.enabled=false` -> no automatic conversation cleanup.
- `cleanup.enabled=true` -> Project mode is required and `cleanup.maxConversations` is required. Pinned chats are always retained; the cap is therefore best-effort when pinned chats exceed it. For recurring new-chat workflows, execution-script `task.retention.maxConversations` compiles to this policy and cleanup runs before each trigger so the new conversation fits inside the cap.
- `project.requiredSourceName` is optional and only valid in Project mode.
- `trigger.prompt` is only required for the `trigger` action; it may also be supplied per run through `args.prompt`.
- `trigger.pluginId` (optional) selects an already-installed ChatGPT Plugin by its
  `plugin_asdk_app_<32 lowercase hex characters>` identifier. When set,
  the adapter opens its ChatGPT plugin page and clicks **Try in chat**
  before sending a new conversation's prompt. Plugin selection is
  opt-in, and does not work with Project mode or conversation reuse.
  The user must grant any OAuth consent required by the plugin. Store
  site-specific plugin IDs in the private harness profile rather than
  hardcoding user plugin metadata in a public repository.
- A successful `trigger` returns both `conversationId` and the canonical conversation URL. Trigger success means the prompt was submitted; it does not mean the assistant has finished.
- `collect` requires `args.conversationId`. `args.conversationUrl` is optional and, when supplied, must be an `https://chatgpt.com/.../c/<conversationId>` URL matching the same ID. `args.timeoutMs` is bounded to 1-90 seconds and defaults to 60 seconds.
- `collect` returns `status: "completed"` with the latest stable assistant text, or `status: "pending"` with any partial text when the bounded wait expires. Harness does not judge answer quality or summarize the child result.
- `collect` accepts optional `args.settleMs` (1000–30000, default 3000). The assistant message count and text must remain unchanged for this quiet period while generation is inactive. Use a longer quiet period for multi-tool runs; still verify backend receipts independently.

ChatGPT's composer can be rendered as either the legacy `#prompt-textarea`
or a visible `[role="textbox"][contenteditable="true"]` editor.
Trigger now polls bounded UI predicates before typing/sending: the original
conversation target is unchanged, prior generation is inactive, exactly one
visible/editable composer is selected, no existing unsent draft is overwritten,
the inserted prompt is semantically complete (reconstructing line breaks from
contenteditable paragraph blocks rather than using raw `innerText.includes` or
`textContent.includes`), and a single visible/enabled Send control is
found (the editor's form first, unique legacy `send-button` fallback).
A Playwright trial click verifies actionability before the **one** real click.
After the single real click, the ChatGPT Site Adapter retains the **same Browser Session**.
A resumed conversation does not count an unchanged `/c/<id>` URL as successful submission:
it waits at least 3 seconds and at most 5 seconds for a newly added User Turn with
a correct conversation identity, exactly one new attributable User Turn, and an empty
composer. Exact source-to-rendered text equality is primary proof. For Markdown code
blocks only, a conservative alternate proof requires a new turn with a real `pre code`
node, a rendered message that is an ordered subsequence of the exact validated
source with **1–24 source-only characters removed and no substituted or inserted
content**, matching leading/trailing 64+ character regions, and the verified
presend editor contents. This is a narrow formatting-correlation proof, not a guarantee
that ChatGPT's renderer preserves source Markdown.
For inline Markdown code (without fenced blocks), a separate narrow proof removes
**only matched single-backtick pairs** from the already verified source, requires
a matching number of actual `code:not(pre code)` nodes with each inline code value
preserved in order, and requires **full equality** between this exact presentation
and the new User bubble. Arbitrary changes, unmatched syntax, absent code nodes,
wrong conversation, nonempty composer, or a second User Turn cannot be accepted.
For nested ChatGPT User content, a single User bubble may contain multiple
`.whitespace-pre-wrap` descendants. The verifier uses a unique **outermost**
content root and continues to require complete prompt attribution, canonical
Conversation identity and settled composer. Multiple sibling roots or unreadable
content remain `unknown`; a nested span is not a second User Turn. The
privacy-safe post-click receipt distinguishes raw and outermost selector counts
without logging message text. See
`ISSUE44_POSTCLICK_OBSERVABILITY_20261029.md` for the real-site evidence.

The ChatGPT trigger receipt retains backward-compatible `triggered` / `unavailable`
/ `ambiguous` statuses and exposes explicit `submissionState` values:
`submitted` / `not_sent` / `unknown`, respectively. This is Browser transport
proof, never proof of native operations or task correctness.
For first-Send new chats, ChatGPT may first use a provisional `local-chatgpt:`
URL before a saved `/c/{id}` route appears. The provisional ID is never a
confirmed conversation or a Collect target. If one new User Turn and the empty
editor are provably owned in the provisional state, only a bounded 12-second
window may await the canonical saved ID and recheck the entire proof.
For first-Send new chats, the expected `/` to `/c/{id}` navigation is recognized
**only after Send**, with exact attributable User Turn, complete source proof and empty
composer. A late verified Turn may receive at most 1,500ms bounded grace to
complete its 600ms settlement dwell; absent/wrong/unrelated turns cannot extend
the deadline and remain ambiguous/non-retryable (Issue #28).
Current ChatGPT user bubbles use `[data-user-message-bubble="true"]`; the older
`[data-message-author-role="user"]` remains a fallback. Count one DOM family at a time
to avoid treating nested wrappers as multiple submitted turns.
Long User bubbles may be **visually collapsed** to 10,240 displayed characters by
ChatGPT. Only the unique newly added User bubble may be expanded using a
recognized `Show more` control, with at most four bounded UI-only attempts
(after transient click failures or a canonical navigation remount). For a first
Project Send, a strongly correlated folded prefix and empty Composer can extend
**observation only** to the existing 12-second ceiling. A prefix, a missing
control, a failed expansion or mismatched expanded text never confirms Send:
full source equality, canonical ID and original Project membership are still
mandatory. See `ISSUE55_FOLDED_PROJECT_ACCEPTANCE_20261030.md`.
A first-Project Send can also navigate to a canonical saved URL while React remounts
its User bubbles as `0→2→0→1`. Only the canonical first-party Project route,
pre-click Project identity, baseline zero and empty Composer allow the same 12s
**observation-only** ceiling. Transient two-bubble observations require a separate
read-only saved-Conversation check of exactly one unique full-matching User Turn
and original Project membership; they do not prove either double dispatch or
successful Send. See `ISSUE57_CANONICAL_HYDRATION_ACCEPTANCE_20261030.md`.
**Issue #60 original first-Project Send recovery:** the Runner now persists the
original Project and input before the one Send click even without a saved
Conversation ID. On live UI ambiguity it reconciles the observed canonical
saved Conversation in a separate read-only tab; a confirmed original saved
User Turn returns the existing `triggered/submitted` so Collect can continue.
Unconfirmed original attempts can use the existing `resume` action without a
second Send. See `ISSUE60_ORIGINAL_ATTEMPT_ACCEPTANCE_20261030.md`.
**Issue #63 existing saved-Conversation continuation:** when a fifth or later
original Attempt cannot be attributed from transient 0/10 React User bubbles,
read-only Resume reopens the same saved Conversation. A stable baseline + 1
User Turn with one unique exact original last message returns `submitted`;
otherwise the Attempt remains UNKNOWN and is never re-sent.
See `ISSUE63_EXISTING_CONVERSATION_RESUME_ACCEPTANCE_20261030.md`.
**Issue #63 persistent message identity (v0.5.13):** the existing saved-Conversation
Send now records first-party persisted User message IDs before its one click,
and confirms the original Attempt using a previously unseen saved message ID
with matching complete input. Transient `baseline + 1` DOM counts do not determine
success for new ID-backed attempts; Resume uses the actual original Project
Conversation route. No named round, extra Send, approval or governance layer.
See `ISSUE63_PERSISTED_MESSAGE_ID_ACCEPTANCE_20261030.md`.
**Issue #66 Composer readiness (v0.5.14):** transient failures reading
`innerText()` or `textContent()` on an otherwise ready ChatGPT editor retry
by reacquiring the live Composer within the existing precompose window, before
and after focus. Real preexisting drafts still stop Send; exactly one Send is
performed when ready. A distinct first-Project #60 investigation compares
confirmed source and observed site behavior without adding governance gates.
See `ISSUE66_COMPOSER_READ_RETRY_AND_ISSUE60_PROJECT_REGRESSION_20261030.md`.
**Issue #68 focus retry (v0.5.15):** if the verified ChatGPT Composer
fails its pre-Send focus click, reacquire the live editor and recheck its
actual draft on the original saved Conversation, within the existing
precompose readiness window. No second Send or governance extension.
See `ISSUE68_COMPOSER_FOCUS_RETRY_20261030.md`.
**Issue #68 original-tab diagnosis (v0.5.16):** a precompose failure now
identifies a missing visible Composer separately from editor text-read failures
and records only numeric/enum DOM readiness facts from the original run-owned
page at the start and deadline. No Send or navigation behavior is changed.
See `ISSUE68_ORIGINAL_TAB_DOM_DIAG_20261031.md`.
**Issue #68 original-page screenshot (v0.5.17):** if a pre-Send Composer is
absent at readiness deadline, the Runner captures the actual still-open
run-owned page viewport once, before closing it. The PNG stays in the
private local Harness profile under `private-diagnostics/`; only the capture
status and randomized filename are returned. No Send/retry behavior changes.
See `ISSUE68_ORIGINAL_TAB_SCREENSHOT_ACCEPTANCE_20261031.md`.
No extra Send or original Run replay is performed; this is a UI-only expansion.
Observations must remain stable; if a click was possible but these predicates fail,
the result is `ambiguous/SEND_OUTCOME_UNKNOWN`, never a safe-to-resend error.
The prior 15-second precompose draft-clearing wait was removed: existing unsent drafts
remain protected and are never erased or overwritten.
There is no unconditional fixed sleep and no automatic resend. The generic Runner receives
`unavailable/PRE_SEND_NOT_READY` (no real Send click attempted) or
`ambiguous/SEND_OUTCOME_UNKNOWN|CONVERSATION_ID_NOT_CONFIRMED` (a real click was
attempted or its post-click identity was not confirmed); ambiguous receipts
persist the existing replay guard. A nonsecret structured diagnostic includes
stage/elapsed time, stripped origin/path and conversation identity,
generation/editor state, raw and visible Send selector counts and
enabled/actionable flags, fixed post-click `submissionConfirmed` and
`composerSettled` booleans and a fixed-schema `postClickReason` value distinguishing
new-turn detection, content read, folded-prefix proof, expansion control/click,
expanded full-text mismatch, editor settlement and target identity. None of these
fields include message excerpts or raw DOM. Also includes fixed `promptIntegrity` status
(`complete`, `empty`, `truncated`, `mismatch`, `unverifiable`); never prompt,
DOM text, cookies or credentials. Actual truncation and unsupported mixed DOM
layouts fail closed before a real click; harmless paragraph line-break
normalization is accepted only when the entire reconstructed input matches.
**Issue #30 Resume-first (ChatGPT existing saved Conversation):** before the single actual
Send click, Harness persists an original private Send Attempt with a UUID,
complete exact source, preceding User Turn counts, saved Conversation ID and
a Browser Profile binding under the owner's local Harness profile
(`send-attempts/<attemptId>.json`, owner-only permissions; never commit this
file or return the source in tools/logs). A failed/uncertain Send returns
`ambiguous/submissionState=unknown` with its `attemptId`; the next Trigger
stays blocked even after a Runner restart. Call
`harness_run({name,action:"resume",args:{attemptId}})` to **reopen the original
saved Conversation and verify the exact original newly attributable User Turn
read-only, without typing or clicking Send**. Resume returns `submitted`
(only on complete matching ownership and settled editor) or
`pending/submissionState=unknown` (no proof yet). Resume is idempotent;
on verified success Harness clears only that attempt's ambiguity lock.
Repeat Resume later only when the saved Conversation loaded normally but the
User Turn has not hydrated. An HTTP error, navigation failure or recognized
security challenge returns `unavailable/submissionState=unknown` with a fixed
nonsecret reason, `retryable:false` and `canResume:false`: stop automatic polling,
keep the original Attempt locked, and resume only after page access is restored.
The existing `collect`
action then independently handles the Assistant response; it does not
need to run inside the Send confirmation window.
This version deliberately supports **only existing saved conversations**.
An original new-chat Send without a validated saved ID cannot be safely
resolved by guessing a provisional URL; it stays unknown. Reconfigured
Browser Profiles or Conversation IDs also cannot confirm older attempts.
The original plaintext source is held only while the private Attempt remains
`unknown`. A verified `submitted` transition atomically **scrubs the original
source text** from the receipt. Unresolved evidence is retained for explicit
owner review and is never auto-deleted or published. Never store that
receipt in GitHub, CI artifacts or public logs.

Any ambiguous dispatch requires external reconciliation before another trigger. Use an authenticated browser profile for real UI smoke tests;
do not commit profiles, cookies, conversation IDs or live receipts.
ChatGPT actions:

- `list_projects`
- `trigger`
- `collect`
- `cleanup` - dry-run by default; `{ "apply": true }` performs deletion. Cleanup preserves pinned chats twice: pinned-ID discovery and a live `Unpin` guard before deletion.

### External subagent-style delegation

The ChatGPT adapter can be used as an external subagent execution substrate without turning Harness into an agent framework:

```text
Parent LLM -> trigger -> child ChatGPT conversation -> collect -> Parent LLM synthesis
```

The Parent LLM owns task decomposition, retry decisions, and result synthesis. Harness only owns deterministic browser/session execution and result collection. The verified POC used `harness_run` with an explicit ChatGPT/CDP profile: `trigger` returned the child conversation identity and `collect` returned the child assistant response end-to-end.

This release does **not** add a general orchestration API. `collect` is an adapter action exposed through `harness_run`; the Execution Script Contract still compiles the existing actions only. `delegate/status/cancel` remain future lifecycle work.
## Multi-provider web chat (Issue #9)

Provider adapters `claude`, `mistral`, `grok` are registered alongside the unchanged `chatgpt` and `generic` adapters. Each provider has its own bootstrap URL, composer, submit, assistant, loading, login and conversation URL selectors. Browser Harness does **not** register a new OAuth connector, share cookies between providers, or implement upstream fallback. The authenticated 2026-10-22 UI inspection confirmed Mistral now redirects /chat to Vibe Work at /work, creates conversations at /work/<id>, uses a form-based ProseMirror editor, a visible Send submit button only after text entry, and answer parts tagged data-message-part-type=answer. Claude and Grok selectors were similarly checked against actual authenticated DOM; the Grok composer has been observed with either `role="textbox"` or `role="combobox"` across authenticated profile instances, so the adapter accepts both. These are observational UI contracts and may change upstream; the opt-in connector picker itself remains unverified and must fail closed.

One-shot scripts can use `task.adapter` = `claude` / `mistral` / `grok`, `task.action` = `status` / `trigger` / `collect`. Trigger example:

```json
{
  "version": "1", "execution": { "mode": "once" },
  "task": {
    "adapter": "claude", "action": "trigger",
    "target": { "conversation": { "mode": "new" } },
    "input": { "prompt": "Use your already connected Queqiao MCP to call list_workspaces and read_file, then report the exact first line." }
  }
}
```

The `harness_execute` compiler assigns one independent `script-<provider>-default` profile for each provider. Low-level `harness_init` / `harness_run` also accept a named independent provider profile, including dedicated `browser.userDataDir` or a knowingly selected `cdpUrl`. CDP attaches to an existing browser by opening its **own new tab** and closing only that tab at the end; no existing user tab is repurposed. Chrome DevTools MCP `--autoConnect` authorization is not itself a Playwright CDP HTTP endpoint: browser-mediated DevTools read-only E2E does not constitute runner-level CDP E2E. With Playwright Core >=1.63, an explicitly authorized Chrome 144+ `chrome://inspect/#remote-debugging` browser can be addressed as `"connection":"cdp","cdpUrl":"chrome"` (instead of assuming a fixed local HTTP port). Chrome may require **additional user approval** for a new Playwright client; a previously approved DevTools MCP client does not grant blanket consent. CDP attachment uses `noDefaults:true` to preserve user browser settings. Do not automate approval or claim E2E PASS on an unconnected browser. Never concurrently open the same Chrome user-data directory in managed mode or copy any authenticated profile/session into this repository. The adapter's `adapterConfig` supports:

```json
{
  "conversation": { "newChatEachRun": true },
  "connector": { "strategy": "preconnected", "name": "Queqiao" },
  "trigger": { "prompt": "..." }
}
```

`preconnected` means the site account was authorized by the user previously, **not** that the Harness has independently proved it. The trigger receipt explicitly returns `connectorVerification: "unverified_until_tool_result"`; only a real observed child tool result can establish that Queqiao was actually used. Opt-in `strategy: "picker"` attempts the provider-specific existing-connector UI and returns `selected_in_ui` only on its selection evidence, otherwise `CONNECTOR_NOT_SELECTED` / `CONNECTOR_UI_UNAVAILABLE`. No adapter performs OAuth registration. These DOM paths may require an account-specific site revalidation. Use a headed bootstrap for one-time login and close the bootstrap browser before launching another managed action. Do not commit the resulting profiles or diagnostics.

`harness_run` / `harness_execute` retain their existing outer transport envelope (`status: \"ok\"`, `action`, `result`): upstream MUST inspect `result.status`, not mistake transport success for Provider success.

A `trigger` result is `{status:"triggered",provider,conversationId,conversationUrl,connectorVerification}` only when the provider's conversation URL is independently observed following a single submit. After a potentially dispatched click fails or its identity cannot be confirmed, the result is `{status:"ambiguous",reason:"SEND_OUTCOME_UNKNOWN"|"CONVERSATION_ID_NOT_CONFIRMED",retryable:false}`: **never automatically retry or replay that prompt**. The per-profile state persists an `ambiguousTrigger` guard across later status/collect calls. Another `trigger` returns `blocked/UNRECONCILED_AMBIGUOUS_TRIGGER` even with `force`; legacy attempts without a durable Send receipt require explicit external reconciliation before using `args.acknowledgeAmbiguous=true`. For an Issue #30 receipt with a pending `attemptId`, **even `force=true` plus `acknowledgeAmbiguous=true` cannot bypass the Send lock**. Use the read-only `action:"resume"` first; only proven original delivery clears that lock. `harness_execute` does not expose that acknowledgement. A pre-send navigation/login/composer/connector failure is `unavailable` with a machine-readable `reason`. A temporary site load failure is `unavailable` with `retryable:true`, and is not a completed answer.

Pass the exact returned `conversationId` and `conversationUrl` to `harness_run({name,action:"collect",args:{conversationId,conversationUrl,timeoutMs:60000,settleMs:3000}})`. The `collect` action rejects any foreign host, ID mismatch, query/fragment or unsupported provider route; it never guesses a different conversation. Results are `completed` with `text` after a stable quiet interval; `generating` or `pending` with `partialText` on a bounded timeout; or `unavailable` with the failure reason. A site UI error never becomes `completed`. A real Cloudflare verification page returns `unavailable/SITE_CHALLENGE` (manual profile intervention required); the adapter never tries to bypass it. The upper layer must check the returned file marker and other task-specific evidence itself. `collect` is read-only with respect to the child conversation and must not trigger again.

No generic ChatGPT Project, @ mention, cleanup, retention or reuse semantics are applied to these providers. Existing `chatgpt` config and `script-chatgpt-default` browser profile are unchanged. On upgrade: install the new package / staged extension through the existing detach / uninstall / install / attach procedure; a staged `dist/runner.js` is pinned by its host and is **not** switched merely by changing TypeScript source. Bootstrap and sign in to **each** provider's own persistent profile once before attempting live Trigger/Collect. Pre-existing account-level Queqiao MCP authorization is checked by the subsequent real read-only child tool result; Harness does not add, configure or authorize the connector. For live tests, use `harness_init` + `harness_bootstrap(open)` with separate managed profiles, then attach each running setup Chrome through its explicit local CDP endpoint for `status` / `trigger` / `collect`. Do not run a second managed Chrome against a profile already opened for setup. The 2026-10-22 compiled-runner live smoke completed all three providers with exact test-only fixture-marker matches; a transient Mistral navigation problem was recovered by the supported bootstrap close/open of its own dedicated browser, followed only by a read-only collect of the existing conversation (no duplicate trigger). These are per-provider acceptance observations, not a guarantee of upstream UI stability. No automatic migration or copying of any original browser profile / token / cookie.

## Generic adapter

`open` navigates to an HTTP(S) URL and optionally waits for a selector. This is the reference that proves the core runtime is site-agnostic.

## Development

```bash
npm install
npm run check
```

Development is TDD-first; CI runs `npm run check`. Before publishing, run `npm run dev:stage` and install the generated unique staging path before attaching to a real worker. The unique path avoids Node ESM module-cache reuse during local same-process reloads. When patching an installed extension use:

```text
detach -> uninstall -> install local -> attach
```

Do not use `queqiao restart` as a substitute for extension reinstallation.

## Runtime observability and restart policy

`harness_overview` returns reconciled progress for all local harness profiles without exposing full adapter prompts/configuration. Runtime state distinguishes desired supervisor state from the observed process state, so a stale PID after reboot is reported as stopped instead of remaining falsely `WAITING`.

Harness restart policy is explicit. `lifecycle.resumePolicy` currently defaults to and only supports `manual`: persisted recurring profiles do not automatically restart after an OS reboot. A future `worker-start` policy requires a Queqiao worker-extension startup lifecycle hook; the current Extension API exposes tool registration but no workspace/runtime startup callback, so the extension does not bypass the host capability model with raw process spawning.
## Release

Release publishing follows the same model as `Queqiao` and `queqiao-mcp`: pushes and pull requests only run CI. npm publishing is triggered by publishing a GitHub Release for an existing `vX.Y.Z` tag, or by an explicit `workflow_dispatch` for an existing release tag.

The release job checks out the immutable release tag, verifies that the tag points at `HEAD`, verifies that the tag matches both `package.json.version` and `queqiao.manifest.version`, then runs `npm ci`, the production dependency audit, and `npm run check`. It skips publishing if that package version already exists in the npm registry. npm authentication uses Trusted Publishing (GitHub Actions OIDC), and successful publishing uses npm provenance.

Release sequence:

```text
merge main -> main CI green -> create vX.Y.Z tag -> publish GitHub Release -> release workflow -> direct npm publish OR npm stage publish
```

The release workflow supports `workflow_dispatch` `publish_mode=auto|direct|stage` for the same immutable tag. `auto` attempts direct Trusted Publishing and only tries the separately authorized staged operation after an authorization-style rejection. To use an existing stage-only Trusted Publisher, dispatch `tag=v0.5.0` with `publish_mode=stage`. A successful `npm stage publish` means **pending maintainer 2FA approval**, not public npm availability: approve the exact version in npm Staged Packages, then verify the Registry version and `latest` dist-tag independently. Do not copy tokens or use a fallback local account publish.

Do not manually publish a version that is intended to be released by this workflow.

### Persistent CDP runner lifecycle

When `browser.connection=cdp`, each harness action attaches a short-lived Playwright client to an already running browser. After `trigger`, `collect`, or failure, the harness disconnects the Playwright client. It does **not** stop Chrome or remove the user-owned browser profile. The process must exit without holding an idle CDP connection.

A local headed Chrome + CDP POC verified an authenticated ChatGPT trigger and a completed collect with an exact synthetic marker. This does **not** establish that ChatGPT Web works from a fresh GitHub-hosted Actions runner: that environment showed a browser challenge. For the hybrid architecture, retain the browser in a trusted persistent environment and route short-lived execution through Queqiao Gateway/Worker; a complete ChatGPT-to-GitHub-Actions tool call is a separate acceptance gate. Never commit browser session data.
