# Queqiao Harness Browser

Worker-side browser harness runtime for Queqiao. The core owns browser/profile lifecycle, scheduling and state; site behavior lives in adapters. Queqiao/MCP business logic is not embedded in harness profiles.

## Mental model

- **Core runtime**: profile init, headed bootstrap, headless run, browser lifecycle, state, lease and interval supervisor.
- **Adapter**: site-specific behavior. Built-ins: `generic`, `chatgpt`.
- **Task rules**: remain in adapter config, target-site data sources and trigger prompts.

Chromium-family browsers are supported today (`chrome`, `edge`, `brave`, `chromium`). Firefox can be added behind the browser-driver boundary later.

## Public tools

| Tool | Purpose |
|---|---|
| `harness_execute` | Preferred LLM-facing entrypoint: validate/compile/execute a resolved script |
| `harness_init` | Low-level create/update a profile |
| `harness_list` | List profiles |
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

The persistent user-data directory remains, so login state survives browser shutdown. `bootstrap` is repeatable when a site requires re-authentication. Managed runs use `browser.headless`; when it is `false`, `browser.startMinimized=true` keeps the runtime browser minimized. Some sites can challenge headless automation; ChatGPT has done so in live verification, so those profiles should use headed-minimized mode.

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
- `conversation.newChatEachRun=true` -> create a new chat for each trigger.
- `conversation.newChatEachRun=false` -> `conversation.conversationId` is required and reused.
- `cleanup.enabled=false` -> no automatic conversation cleanup.
- `cleanup.enabled=true` -> Project mode is required and `cleanup.maxConversations` is required. Pinned chats are always retained; the cap is therefore best-effort when pinned chats exceed it.
- `project.requiredSourceName` is optional and only valid in Project mode.
- `trigger.prompt` is only required for the `trigger` action; it may also be supplied per run through `args.prompt`.

ChatGPT actions:

- `list_projects`
- `trigger`
- `cleanup` — dry-run by default; `{ "apply": true }` performs deletion. Cleanup preserves pinned chats twice: pinned-ID discovery and a live `Unpin` guard before deletion.

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
