import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "./chatgpt-adapter.js";

const ID = "11111111-1111-4111-8111-111111111111";

function fixture(opts: { legacy?: boolean; plugin?: boolean; resume?: boolean; siteBubble?: boolean; postClickStuck?: boolean; postClickSettleAfter?: number; composerStuck?: boolean; postedDifferentText?: boolean; collapseLong?: boolean; foldedDifferent?: boolean; noExpand?: boolean; expandWrongText?: boolean; renderedFormatted?: boolean; noFormattedDOM?: boolean; changedRenderedTail?: boolean; changedRenderedMiddle?: boolean; concurrentNewTurn?: boolean; renderedInline?: boolean; inlineMutate?: boolean; inlineDomMissing?: boolean; inlineCodeMutate?: boolean; wrongOrigin?: boolean; wrongResumeId?: boolean; initialDraft?: string; onWait?: (ms: number) => void } = {}) {
  let logicalNow = 0;
  vi.spyOn(Date, "now").mockImplementation(() => { logicalNow += 180; return logicalNow; });
  const calls: string[] = [];
  let editorText = opts.initialDraft ?? "";
  let url = "https://chatgpt.com/";
  let userTurns = opts.resume ? 1 : 0;
  let lastUserText = "existing synthetic earlier turn";
  let pendingUserText: string | null = null;
  let polls = 0;
  const completeUserTurn = (value: string) => {
    userTurns += opts.concurrentNewTurn ? 2 : 1;
    lastUserText = opts.postedDifferentText ? "unrelated user turn" : value;
    if (!opts.composerStuck) editorText = "";
  };
  let expanded = false;
  const shownText = () => opts.renderedInline
    ? (() => { const text = lastUserText.replace(/`([^`\r\n]+)`/g, "$1");
      return opts.inlineMutate ? text.replace("END_INTACT", "END_MUTATED") : text; })()
    : opts.renderedFormatted && lastUserText.length > 700
    ? (() => {
      const basic = lastUserText.slice(0, 380) + lastUserText.slice(392);
      const changedMiddle = opts.changedRenderedMiddle
        ? basic.slice(0, 900) + "Z".repeat(84) + basic.slice(984) : basic;
      return changedMiddle.slice(0, opts.changedRenderedTail ? -150 : undefined)
        + (opts.changedRenderedTail ? "UNRELATED_CONTENT_" + "X".repeat(132) : "");
    })()
    : opts.expandWrongText && expanded ? "mismatched synthetic content" :
    opts.collapseLong && !expanded ? (opts.foldedDifferent ? "… " : "") + lastUserText.slice(0, 10_240) : lastUserText;
  const content = { innerText: vi.fn(async () => shownText()), locator: vi.fn((selector: string) => ({
    count: vi.fn(async () => selector === "code:not(pre code)" && opts.renderedInline && !opts.inlineDomMissing
      ? (lastUserText.match(/`([^`\r\n]+)`/g) || []).length
      : selector === "pre code" && opts.renderedFormatted && !opts.noFormattedDOM ? 1 : 0),
    allInnerTexts: vi.fn(async () => selector === "code:not(pre code)" && opts.renderedInline
      ? (lastUserText.match(/`([^`\r\n]+)`/g) || []).map((t, i) => i === 2 && opts.inlineCodeMutate ? "MUTATED" : t.slice(1, -1)) : []),
  })) };
  const expand = {
    count: vi.fn(async () => opts.collapseLong && !expanded && !opts.noExpand ? 1 : 0),
    click: vi.fn(async () => { calls.push("expand"); expanded = true; }),
  };
  const userMessage = {
    innerText: vi.fn(async () => shownText()), textContent: vi.fn(async () => shownText()),
    locator: vi.fn((selector: string) => selector === ".whitespace-pre-wrap"
      ? { count: vi.fn(async () => (opts.collapseLong || opts.renderedFormatted || opts.renderedInline) ? 1 : 0), first: vi.fn(() => content) }
      : { count: vi.fn(async () => 0) }),
    getByRole: vi.fn(() => expand),
  };
  const userTurnsLocator = { count: vi.fn(async () => opts.siteBubble ? 0 : userTurns), nth: vi.fn(() => userMessage) };
  const bubbleTurnsLocator = { count: vi.fn(async () => opts.siteBubble ? userTurns : 0), nth: vi.fn(() => userMessage) };
  const send = {
    count: vi.fn(async () => 1), first() { return this; },
    isVisible: vi.fn(async () => true), isEnabled: vi.fn(async () => true),
    click: vi.fn(async (args?: { trial?: boolean }) => {
      if (!args?.trial) {
        calls.push("send");
        if (!opts.resume) url = opts.wrongOrigin ? `https://invalid.example/c/${ID}` : `https://chatgpt.com/c/${ID}`;
        else if (opts.wrongResumeId) url = "https://chatgpt.com/c/22222222-2222-4222-8222-222222222222";
        if (!opts.postClickStuck) {
          if (opts.postClickSettleAfter !== undefined) pendingUserText = editorText;
          else completeUserTurn(editorText);
        }
      }
    }),
  };
  const form = {
    count: vi.fn(async () => opts.legacy ? 0 : 1),
    locator: vi.fn(() => send),
  };
  const composer = {
    count: vi.fn(async () => 1), first() { return this; },
    isVisible: vi.fn(async () => true), isEditable: vi.fn(async () => true),
    innerText: vi.fn(async () => editorText), textContent: vi.fn(async () => editorText),
    evaluate: vi.fn(async () => editorText),
    locator: vi.fn(() => form),
    click: vi.fn(async () => { calls.push("composer"); }),
  };
  const stop = { first() { return this; }, isVisible: vi.fn(async () => false) };
  const tryInChat = {
    waitFor: vi.fn(async () => undefined),
    click: vi.fn(async () => { calls.push("try-in-chat"); url = "https://chatgpt.com/"; }),
  };
  const page = {
    goto: vi.fn(async (target: string) => { calls.push("goto:" + target); url = target; }),
    getByRole: vi.fn(() => tryInChat),
    locator: vi.fn((selector: string) => {
      if (selector === '[data-message-author-role="user"]') return userTurnsLocator;
      if (selector === '[data-user-message-bubble="true"]') return bubbleTurnsLocator;
      if (/stop-button|Stop generating|停止產生|停止生成/.test(selector)) return stop;
      if (selector.includes("send-button") || selector.includes('button[type="submit"]')) return send;
      if (selector.includes("#prompt-textarea") || selector.includes('[role="textbox"]')) return composer;
      throw new Error("Unexpected selector " + selector);
    }),
    keyboard: { insertText: vi.fn(async (value: string) => { calls.push("typing"); editorText += value; }) },
    waitForTimeout: vi.fn(async (duration: number) => {
      opts.onWait?.(duration);
      polls++;
      if (pendingUserText !== null && polls >= (opts.postClickSettleAfter ?? 0)) {
        completeUserTurn(pendingUserText);
        pendingUserText = null;
      }
    }),
    waitForURL: vi.fn(async () => undefined),
    url: vi.fn(() => url),
  };
  return { page, calls, send, composer, form, userTurnsLocator, get polls() { return polls; } };
}

afterEach(() => vi.restoreAllMocks());

describe("ChatGPT composer compatibility", () => {
  it("sends with the current contenteditable textbox and its own form submit control", async () => {
    const f = fixture();
    const result = await chatgptAdapter.execute("trigger", { prompt: "Gate C harness probe" }, {
      browser: { page: f.page },
      config: { adapterConfig: { project: { enabled: false }, conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.form.locator).toHaveBeenCalledWith(expect.stringContaining('button[type="submit"]'));
    expect(f.page.keyboard.insertText).toHaveBeenCalledWith("Gate C harness probe");
    expect(f.send.click.mock.calls.filter((args) => !args[0]?.trial)).toHaveLength(1);
  });

  it("also supports a unique legacy test-ID Send outside an editor form", async () => {
    const f = fixture({ legacy: true });
    const result = await chatgptAdapter.execute("trigger", { prompt: "legacy layout" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered" });
    expect(f.page.locator).toHaveBeenCalledWith('[data-testid="send-button"]:visible');
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("preserves the installed plugin Try in chat flow", async () => {
    const f = fixture({ plugin: true });
    const response = await chatgptAdapter.execute("trigger", { prompt: "Use plugin to verify worker" }, {
      browser: { page: f.page }, config: { adapterConfig: {
        conversation: { newChatEachRun: true }, trigger: {
          pluginId: "plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      } },
    });
    expect(response).toMatchObject({ status: "triggered" });
    expect(f.page.goto).toHaveBeenCalledWith(
      "https://chatgpt.com/plugins/plugin_asdk_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expect.any(Object),
    );
    expect(f.calls.indexOf("try-in-chat")).toBeGreaterThan(f.calls.findIndex(x => x.startsWith("goto:")));
    expect(f.calls.indexOf("try-in-chat")).toBeLessThan(f.calls.indexOf("typing"));
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([false, true])("accepts a new User Turn on the current ChatGPT bubble DOM (#20; resume=%s)", async (resume) => {
    const f = fixture({ resume, siteBubble: true });
    const prompt = "Synthetic current site bubble\\n\\n中文 ✅";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: !resume, conversationId: resume ? ID : undefined } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([false, true])("confirms only a fully expanded long User bubble (#22; resume=%s)", async (resume) => {
    const f = fixture({ resume, siteBubble: true, collapseLong: true });
    const prompt = "Synthetic long-only test\n\n" + "中文 Markdown **sample**\n".repeat(800)
      + "END_OF_LONG_SYNTHETIC_PROMPT";
    expect(prompt.length).toBeGreaterThan(10_240);
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: !resume, conversationId: resume ? ID : undefined } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(f.calls.filter(x => x === "expand")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it.each([{ noExpand: true }, { expandWrongText: true }])(
    "never accepts a collapsed-prefix or mismatched expanded message (#22)", async (flags) => {
      const f = fixture({ siteBubble: true, collapseLong: true, ...flags });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const prompt = "Synthetic NOT_OWNED_BY_OTHER_TURN " + "long message ".repeat(1000);
      const result = await chatgptAdapter.execute("trigger", { prompt }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: true } } },
      });
      expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    },
  );

  it.each([{ noExpand: true }, { expandWrongText: true }])(
    "reports the exact, nonsecret post-click proof blocker (#24 RED)", async flags => {
      const f = fixture({ siteBubble: true, collapseLong: true, ...flags });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const prompt = "Synthetic assembled prompt " + "long text section ".repeat(900);
      const result = await chatgptAdapter.execute("trigger", { prompt }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: true } } },
      });
      expect(result).toMatchObject({
        status: "ambiguous", retryable: false,
        diagnostic: {
          stage: "postclick",
          postClickReason: flags.noExpand ? "expand_control_missing" : "expanded_text_mismatch",
        },
      });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(prompt);
    },
  );

  it.each([false, true])("confirms only the full expanded text when the folded display is not an expected prefix (#24; resume=%s)", async resume => {
    const f = fixture({ resume, siteBubble: true, collapseLong: true, foldedDifferent: true });
    const prompt = "Synthetic assembled prompt " + "中文 Markdown sample ".repeat(820)
      + "ORIGINAL_EXPECTED_TAIL";
    expect(prompt.length).toBeGreaterThan(10_240);
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: !resume, conversationId: resume ? ID : undefined } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(f.calls.filter(x => x === "expand")).toHaveLength(1);
  });

  it.each([{ noExpand: true }, { expandWrongText: true }])(
    "still fails closed on non-prefix folded text without trustworthy full equality (#24)", async flags => {
      const f = fixture({ siteBubble: true, collapseLong: true, foldedDifferent: true, ...flags });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const prompt = "Synthetic assembled prompt " + "中文 Markdown sample ".repeat(820)
        + "ORIGINAL_EXPECTED_TAIL";
      const result = await chatgptAdapter.execute("trigger", { prompt }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: true } } },
      });
      expect(result).toMatchObject({ status: "ambiguous", retryable: false });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(prompt);
    },
  );

  it.each([false, true])("accepts attributable formatted User Turn despite a 12-character renderer delta (#24; resume=%s)", async resume => {
    const f = fixture({ siteBubble: true, resume, renderedFormatted: true });
    const prompt = "Proof-only synthetic source: " + "A".repeat(340)
      + "~~~code sample~~~" + "one isolated markdown paragraph ".repeat(305)
      + "EXACT_UNIQUE_SYNTHETIC_TAIL";
    expect(prompt.length).toBeGreaterThan(8_000);
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: !resume, conversationId: resume ? ID : undefined } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it.each([{ noFormattedDOM: true }, { changedRenderedTail: true }])(
    "fails closed for unrelated rendered content or missing formatting proof (#24)", async extra => {
      const f = fixture({ siteBubble: true, renderedFormatted: true, ...extra });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const prompt = "Proof-only synthetic source: " + "A".repeat(340)
        + "~~~code sample~~~" + "one isolated markdown paragraph ".repeat(305)
        + "EXACT_UNIQUE_SYNTHETIC_TAIL";
      const result = await chatgptAdapter.execute("trigger", { prompt }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: true } } },
      });
      expect(result).toMatchObject({ status: "ambiguous", retryable: false });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(prompt);
    },
  );

  it("does not accept same-length substituted middle even if source/rendered prefix and suffix exceed 85% (#24)", async () => {
    const f = fixture({ siteBubble: true, renderedFormatted: true, changedRenderedMiddle: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const prompt = "Proof-only synthetic source: " + "A".repeat(340)
      + "~~~code sample~~~" + "one isolated markdown paragraph ".repeat(305)
      + "EXACT_UNIQUE_SYNTHETIC_TAIL";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", retryable: false });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("fails closed when two User Turns appear after one owned Send (#24 concurrent turn guard)", async () => {
    const f = fixture({ siteBubble: true, concurrentNewTurn: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const result = await chatgptAdapter.execute("trigger", { prompt: "synthetic concurrent turn guard" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", retryable: false });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([false, true])("confirms an attributable inline-code continuation without raw-Markdown text equality (#24 resume=%s)", async resume => {
    const f = fixture({ resume, siteBubble: true, renderedInline: true });
    const prompt = "Synthetic verified skill-like return\\n\\n" + Array.from({ length: 54 }, (_, i) =>
      "Key " + i + ": `synthetic_" + i + "` is verified by the caller.").join("\\n")
      + "\\nEND_INTACT";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: !resume, conversationId: resume ? ID : undefined } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it.each([{ inlineMutate: true }, { inlineCodeMutate: true }, { inlineDomMissing: true }])(
    "does not accept altered or unproven inline-code return content (#24)", async flags => {
      const f = fixture({ siteBubble: true, renderedInline: true, ...flags });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const prompt = "Validated source " + Array.from({ length: 54 }, (_, i) =>
        "Key " + i + ": `synthetic_" + i + "` must be intact.").join("\\n")
        + "\\nEND_INTACT";
      const result = await chatgptAdapter.execute("trigger", { prompt }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: true } } },
      });
      expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(prompt);
    },
  );

  it("exposes not_sent before any click and unknown after an unproven click (#24 transport receipt)", async () => {
    const noSend = fixture();
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 3000; return now; });
    noSend.composer.count.mockResolvedValue(0);
    // Pre-compose is definitively unavailable; zero clicks means not_sent.


    const noSendReceipt = await chatgptAdapter.execute("trigger", { prompt: "synthetic no-send" }, {
      browser: { page: noSend.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(noSendReceipt).toMatchObject({ status: "unavailable", submissionState: "not_sent" });
    expect(noSend.calls.filter(x => x === "send")).toHaveLength(0);

    const unknown = fixture({ postClickStuck: true });
    const uncertain = await chatgptAdapter.execute("trigger", { prompt: "synthetic unknown-send" }, {
      browser: { page: unknown.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(uncertain).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false });
    expect(unknown.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("confirms a first-new-chat Send when its sole matching User Turn settles near the timeout (#28 RED)", async () => {
    let clock = 0;
    const f = fixture({ siteBubble: true, postClickSettleAfter: 23, onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_FIRST_SEND_SETTLED_NEAR_TIMEOUT" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered", submissionState: "submitted", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([
    { wrongOrigin: true },
    { postClickStuck: true },
    { postedDifferentText: true },
    { concurrentNewTurn: true },
    { composerStuck: true },
  ])("fails closed when a first new-chat turn is not provably owned during the bounded grace (#28)", async flags => {
    let clock = 0;
    const f = fixture({ siteBubble: true, postClickSettleAfter: 23, onWait: ms => { clock += ms; }, ...flags });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const prompt = "SYNTHETIC_FIRST_SEND_EXACT_OWNERSHIP_REQUIRED";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(clock).toBeLessThanOrEqual(5_200);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it("does not grant first-chat navigation grace for a wrong resumed Conversation ID (#28)", async () => {
    let clock = 0;
    const f = fixture({ resume: true, siteBubble: true, wrongResumeId: true,
      postClickSettleAfter: 23, onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_WRONG_RESUME_ID" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false,
      diagnostic: { sameTarget: false } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("refuses an unrelated draft without clicking Send (#28)", async () => {
    const f = fixture({ initialDraft: "UNRELATED_ALREADY_TYPED_CONTENT" });
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_NO_DRAFT_OVERWRITE" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent", retryable: true,
      diagnostic: { precomposeReason: "draft_present" } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(0);
    expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
  });

  it("does not treat new-chat URL navigation alone as confirmed submission (#20)", async () => {
    const f = fixture({ postClickStuck: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const result = await chatgptAdapter.execute("trigger", { prompt: "synthetic URL-only submission" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false,
      diagnostic: { stage: "postclick", submissionConfirmed: false } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("does not confirm resumed Send from a successful click and unchanged URL alone (#20 RED)", async () => {
    const f = fixture({ resume: true, postClickStuck: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const prompt = "SYNTHETIC_PRIVATE_POSTCLICK_20\n\n- 中文";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false,
      diagnostic: { stage: "postclick", submissionConfirmed: false, composerSettled: false } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it("waits within the same Browser Session for the new User Turn and editor settlement (#20)", async () => {
    const f = fixture({ resume: true, postClickSettleAfter: 2 });
    const result = await chatgptAdapter.execute("trigger", { prompt: "Synthetic resumed\n\n中文 ✅" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.polls).toBeGreaterThanOrEqual(2);
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([{ composerStuck: true }, { postedDifferentText: true }])(
    "does not confirm a partial post-click settlement (#20)", async (options) => {
      const f = fixture({ resume: true, ...options });
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
      const result = await chatgptAdapter.execute("trigger", { prompt: "isolated post-click integrity" }, {
        browser: { page: f.page },
        config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
      });
      expect(result).toMatchObject({ status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false });
      expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    },
  );

  it("preserves an existing conversation target without creating another conversation", async () => {
    const f = fixture({ resume: true });
    const result = await chatgptAdapter.execute("trigger", { prompt: "resumed generic conversation" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(f.page.goto).toHaveBeenCalledWith(`https://chatgpt.com/c/${ID}`, expect.any(Object));
    expect(result).toMatchObject({ status: "triggered", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });
});
