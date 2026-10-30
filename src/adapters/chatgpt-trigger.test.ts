import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter, firstChatProjectReceiptUrl } from "./chatgpt-adapter.js";
import { sendChatGptPrompt } from "./chatgpt-send.js";

const ID = "11111111-1111-4111-8111-111111111111";

function fixture(opts: { legacy?: boolean; plugin?: boolean; resume?: boolean; siteBubble?: boolean; postClickStuck?: boolean; postClickSettleAfter?: number; composerStuck?: boolean; postedDifferentText?: boolean; collapseLong?: boolean; foldedDifferent?: boolean; expandClickFailsOnce?: boolean; refoldOnSave?: boolean; lateShowMoreAtPoll?: number; noExpand?: boolean; expandWrongText?: boolean; renderedFormatted?: boolean; noFormattedDOM?: boolean; changedRenderedTail?: boolean; changedRenderedMiddle?: boolean; concurrentNewTurn?: boolean; renderedInline?: boolean; inlineMutate?: boolean; inlineDomMissing?: boolean; inlineCodeMutate?: boolean; wrongOrigin?: boolean; wrongResumeId?: boolean; pendingFirstChat?: boolean; saveAtPoll?: number; projectFirstChat?: boolean; wrongProject?: boolean; wrongCanonicalProject?: boolean; projectAlias?: boolean; memberFound?: boolean; memberWrongId?: boolean; initialDraft?: string; onWait?: (ms: number) => void; contentMatchCount?: number; contentReadFailure?: boolean; turnReadFailure?: boolean; contentCountFailure?: boolean; outermostMatchCount?: number; postClickBubbleCounts?: number[]; readbackTurnCount?: number; readbackWrongText?: boolean } = {}) {
  let logicalNow = 0;
  vi.spyOn(Date, "now").mockImplementation(() => { logicalNow += 180; return logicalNow; });
  const calls: string[] = [];
  let editorText = opts.initialDraft ?? "";
  let url = opts.projectFirstChat ? "https://chatgpt.com/g/g-p-synthetic/project" : "https://chatgpt.com/";
  let userTurns = opts.resume ? 1 : 0;
  let lastUserText = "existing synthetic earlier turn";
  let pendingUserText: string | null = null;
  let polls = 0;
  let sent = false;
  let postClickPolls = 0;
  const completeUserTurn = (value: string) => {
    userTurns += opts.concurrentNewTurn ? 2 : 1;
    lastUserText = opts.postedDifferentText ? "unrelated user turn" : value;
    if (!opts.composerStuck) editorText = "";
  };
  let expanded = false;
  let expansionFailureConsumed = false;
  let refoldPerformed = false;
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
  const content = { innerText: vi.fn(async () => { if (opts.contentReadFailure) throw new Error("transient content read failure"); return shownText(); }), locator: vi.fn((selector: string) => ({
    count: vi.fn(async () => selector === "code:not(pre code)" && opts.renderedInline && !opts.inlineDomMissing
      ? (lastUserText.match(/`([^`\r\n]+)`/g) || []).length
      : selector === "pre code" && opts.renderedFormatted && !opts.noFormattedDOM ? 1 : 0),
    allInnerTexts: vi.fn(async () => selector === "code:not(pre code)" && opts.renderedInline
      ? (lastUserText.match(/`([^`\r\n]+)`/g) || []).map((t, i) => i === 2 && opts.inlineCodeMutate ? "MUTATED" : t.slice(1, -1)) : []),
  })) };
  const expand = {
    count: vi.fn(async () => opts.collapseLong && !expanded && !opts.noExpand
      && (opts.lateShowMoreAtPoll === undefined || polls >= opts.lateShowMoreAtPoll) ? 1 : 0),
    click: vi.fn(async () => {
      calls.push("expand");
      if (opts.expandClickFailsOnce && !expansionFailureConsumed) {
        expansionFailureConsumed = true;
        throw new Error("synthetic transient UI replacement");
      }
      expanded = true;
    }),
  };
  const userMessage = {
    innerText: vi.fn(async () => { if (opts.turnReadFailure) throw new Error("transient turn read failure"); return shownText(); }), textContent: vi.fn(async () => shownText()),
    locator: vi.fn((selector: string) => selector === ".whitespace-pre-wrap" || selector === ".whitespace-pre-wrap:not(.whitespace-pre-wrap .whitespace-pre-wrap)"
      ? { count: vi.fn(async () => { if (opts.contentCountFailure) throw new Error("content selector failed"); const raw = opts.contentMatchCount ?? ((opts.collapseLong || opts.renderedFormatted || opts.renderedInline) ? 1 : 0); return selector === ".whitespace-pre-wrap" ? raw : opts.outermostMatchCount ?? raw; }), first: vi.fn(() => content) }
      : { count: vi.fn(async () => 0) }),
    getByRole: vi.fn(() => expand),
  };
  const userTurnsLocator = { count: vi.fn(async () => opts.siteBubble ? 0 : userTurns), nth: vi.fn(() => userMessage) };
  const bubbleTurnsLocator = { count: vi.fn(async () => opts.siteBubble
    ? sent && opts.postClickBubbleCounts
      ? opts.postClickBubbleCounts[Math.min(postClickPolls, opts.postClickBubbleCounts.length - 1)]
      : userTurns
    : 0), nth: vi.fn(() => userMessage) };
  const send = {
    count: vi.fn(async () => 1), first() { return this; },
    isVisible: vi.fn(async () => true), isEnabled: vi.fn(async () => true),
    click: vi.fn(async (args?: { trial?: boolean }) => {
      if (!args?.trial) {
        calls.push("send");
        sent = true;
        if (!opts.resume) url = opts.wrongOrigin ? `https://invalid.example/c/${ID}` : opts.pendingFirstChat
          ? (opts.projectFirstChat ? `https://chatgpt.com/g/${opts.wrongProject ? "g-p-unrelated" : opts.projectAlias ? "g-p-routealias" : "g-p-synthetic"}/c/local-chatgpt%3A${ID}` : `https://chatgpt.com/c/local-chatgpt%3A${ID}`)
          : (opts.projectFirstChat ? `https://chatgpt.com/g/g-p-synthetic/c/${ID}` : `https://chatgpt.com/c/${ID}`);
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
  const memberLink = {
    waitFor: vi.fn(async () => { if (!opts.memberFound) throw new Error("not listed"); }),
    getAttribute: vi.fn(async () => opts.memberWrongId
      ? "/g/g-p-routealias/c/22222222-2222-4222-8222-222222222222"
      : "/g/g-p-routealias/c/" + ID),
  };
  const memberPage = {
    goto: vi.fn(async () => undefined),
    url: vi.fn(() => "https://chatgpt.com/g/g-p-synthetic/project"),
    locator: vi.fn(() => ({
      count: vi.fn(async () => opts.memberFound ? 1 : 0),
      first: vi.fn(() => memberLink),
    })),
    close: vi.fn(async () => undefined),
  };
  const readbackMessage = {
    locator: vi.fn(() => ({
      count: vi.fn(async () => 1),
      first: vi.fn(() => ({
        innerText: vi.fn(async () => opts.readbackWrongText ? "OTHER_SAVED_MESSAGE" : lastUserText),
      })),
    })),
  };
  let readbackUrl = "";
  const readbackPage = {
    goto: vi.fn(async (target: string) => { readbackUrl = target; }),
    url: vi.fn(() => readbackUrl),
    locator: vi.fn(() => ({
      count: vi.fn(async () => opts.readbackTurnCount ?? 1),
      first: vi.fn(() => ({
        waitFor: vi.fn(async () => undefined),
        locator: readbackMessage.locator,
      })),
    })),
    waitForTimeout: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  let probeCount = 0;
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
      if (sent) postClickPolls++;
      if (opts.pendingFirstChat && opts.saveAtPoll !== undefined && polls >= opts.saveAtPoll) {
        if (opts.refoldOnSave && !refoldPerformed) { expanded = false; refoldPerformed = true; }
        url = opts.projectFirstChat ? `https://chatgpt.com/g/${opts.wrongCanonicalProject ? "g-p-unrelated" : opts.projectAlias ? "g-p-routealias" : "g-p-synthetic"}/c/${ID}` : `https://chatgpt.com/c/${ID}`;
      }
      if (pendingUserText !== null && polls >= (opts.postClickSettleAfter ?? 0)) {
        completeUserTurn(pendingUserText);
        pendingUserText = null;
      }
    }),
    waitForURL: vi.fn(async () => undefined),
    url: vi.fn(() => url),
    context: vi.fn(() => ({ newPage: vi.fn(async () => (++probeCount === 1 ? memberPage : readbackPage)) })),
  };
  return { page, calls, send, composer, form, userTurnsLocator, get polls() { return polls; } };
}

afterEach(() => vi.restoreAllMocks());

describe("Issue #53 canonical Project receipt must preserve observed saved route", () => {
  const savedId = "11111111-1111-4111-8111-111111111111";
  it("preserves the site-returned canonical Project alias (not the pre-click ID)", () => {
    const url = "https://chatgpt.com/g/g-p-routealias/c/" + savedId;
    expect(firstChatProjectReceiptUrl(url, savedId)).toBe(url);
  });
  it.each([
    "https://chatgpt.com/c/" + savedId,
    "https://invalid.example/g/g-p-routealias/c/" + savedId,
    "https://chatgpt.com/g/g-p-routealias/c/local-chatgpt%3A" + savedId,
    "https://chatgpt.com/g/g-p-routealias/c/22222222-2222-4222-8222-222222222222",
    "https://chatgpt.com/g/g-p-routealias/c/" + savedId + "?other=1",
  ])("rejects an unproven or mismatched Project receipt route: %s", url => {
    expect(firstChatProjectReceiptUrl(url, savedId)).toBeNull();
  });
});
describe("Project runtime trigger destination (#37)", () => {
  const projectUrl = "https://chatgpt.com/g/g-p-synthetic-project/c/" + ID;
  const run = (f: ReturnType<typeof fixture>) => chatgptAdapter.execute("trigger", {
    prompt: "synthetic V2 return receipt", conversationId: ID, conversationUrl: projectUrl,
  }, { browser: { page: f.page }, config: { adapterConfig: {
    conversation: { newChatEachRun: true, allowRuntimeTarget: true },
  } } });

  it("navigates directly to the exact Project conversation and returns its scoped URL", async () => {
    const f = fixture({resume:true,siteBubble:true});
    const receipt = await run(f);
    expect(receipt).toMatchObject({
      status: "triggered", submissionState: "submitted", conversationId: ID, url: projectUrl,
    });
    expect(f.page.goto).toHaveBeenCalledWith(projectUrl, expect.any(Object));
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });
  it("fails before sending when the browser navigates to another target", async () => {
    const f = fixture({resume:true,siteBubble:true});
    f.page.goto.mockImplementation(async () => undefined);
    await expect(run(f)).rejects.toThrow(/RUNTIME_TARGET_NAVIGATION_MISMATCH/);
    expect(f.calls).not.toContain("send");
  });
  it("does not acknowledge an unrelated post-send conversation", async () => {
    const f = fixture({resume:true,siteBubble:true,wrongResumeId:true});
    const receipt = await run(f);
    expect(receipt).toMatchObject({status:"ambiguous", retryable:false});
    expect(f.calls.filter(x=>x==="send")).toHaveLength(1);
  });
});


describe("ChatGPT composer compatibility", () => {
  it("persists exact pre-click Resume baseline once and never exposes source in the acknowledgement (#30)", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    const original = "SYNTHETIC_CAPTURE_PRIOR_TO_ONE_SEND";
    const beforeSend = vi.fn(async (_prompt: string, _info: unknown) => undefined);
    const outcome = await chatgptAdapter.execute("trigger", { prompt: original }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
      beforeSend,
    });
    expect(outcome).toMatchObject({ status: "triggered", submissionState: "submitted" });
    expect(beforeSend).toHaveBeenCalledExactlyOnceWith(original, {
      conversationId: ID, baseline: { bubbles: 1, legacy: 0 },
    });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(JSON.stringify(outcome)).not.toContain(original);
  });

  it("Issue #66 RED: one transient pre-focus read error retries existing Composer and sends only once", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    f.composer.innerText.mockRejectedValueOnce(new Error("one transient editor read failure"));
    const beforeSend = vi.fn(async () => undefined);
    const result = await chatgptAdapter.execute("trigger", { prompt: "ISSUE66_SYNTHETIC_RECOVERED_EMPTY_EDITOR" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
      beforeSend,
    });
    expect(result).toMatchObject({ status: "triggered", submissionState: "submitted" });
    expect(f.composer.innerText.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(f.page.keyboard.insertText).toHaveBeenCalledOnce();
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("Issue #66: one transient textContent read error also retries without overwriting anything", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    f.composer.textContent.mockRejectedValueOnce(new Error("temporary content read failure"));
    const result = await chatgptAdapter.execute("trigger", { prompt: "ISSUE66_SYNTHETIC_TEXTCONTENT_RECOVERY" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "triggered" });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("Issue #66 RED: one transient post-focus read error retries live editor without a second click", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    f.composer.innerText.mockResolvedValueOnce("").mockRejectedValueOnce(new Error("focus remount")).mockResolvedValue("");
    const result = await chatgptAdapter.execute("trigger", { prompt: "ISSUE66_SYNTHETIC_FOCUSED_EDITOR" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "triggered" });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(f.page.keyboard.insertText).toHaveBeenCalledOnce();
  });

  it("Issue #66: a real draft appearing after a transient error is not overwritten", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    f.composer.innerText.mockRejectedValueOnce(new Error("transient read"))
      .mockResolvedValueOnce("EXTERNAL_REAL_DRAFT");
    const beforeSend = vi.fn();
    const result = await chatgptAdapter.execute("trigger", { prompt: "ISSUE66_DO_NOT_OVERWRITE" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
      beforeSend,
    });
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent",
      diagnostic: { precomposeReason: "draft_present" } });
    expect(beforeSend).not.toHaveBeenCalled();
    expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
    expect(f.calls.filter(x => x === "send")).toHaveLength(0);
  });

  it("Issue #66: persistent editor read failure still ends before any Send", async () => {
    const f = fixture({ resume: true, siteBubble: true });
    f.composer.innerText.mockRejectedValue(new Error("still unreadable"));
    const result = await chatgptAdapter.execute("trigger", { prompt: "ISSUE66_NO_UNVERIFIED_SEND" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent",
      diagnostic: { precomposeReason: "editor_read_failed" } });
    expect(f.page.keyboard.insertText).not.toHaveBeenCalled();
    expect(f.calls.filter(x => x === "send")).toHaveLength(0);
  });

  it("never records a possible Send for an unrelated preexisting draft (#30)", async () => {
    const f = fixture({ resume: true, siteBubble: true, initialDraft: "EXTERNAL_USER_DRAFT" });
    const beforeSend = vi.fn();
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_NO_DISPATCH" }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
      beforeSend,
    });
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent" });
    expect(beforeSend).not.toHaveBeenCalled();
    expect(f.calls.filter(x => x === "send")).toHaveLength(0);
  });


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

  it("waits for a verified local first-chat draft to become a saved Conversation before confirming (#28 RED)", async () => {
    let clock = 0;
    const f = fixture({ siteBubble: true, pendingFirstChat: true, saveAtPoll: 34,
      onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_PROVISIONAL_URL_BEFORE_PERSISTENCE" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered", submissionState: "submitted", conversationId: ID });
    expect(clock).toBeGreaterThanOrEqual(6_600);
    expect(clock).toBeLessThanOrEqual(12_200);
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("Issue #53 RED: delayed canonical save in the exact Project is recognized only after a verified single first Turn", async () => {
    let clock = 0;
    const f = fixture({ siteBubble: true, projectFirstChat: true, pendingFirstChat: true,
      saveAtPoll: 34, onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0], "SYNTHETIC_PROJECT_PROVISIONAL_WITH_DELAYED_SAVE"))
      .resolves.toEqual(expect.any(Number));
    expect(clock).toBeGreaterThanOrEqual(6_600);
    expect(clock).toBeLessThanOrEqual(12_200);
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([
    { saveAtPoll: undefined },
    { saveAtPoll: 34, postedDifferentText: true },
    { saveAtPoll: 34, concurrentNewTurn: true },
    { saveAtPoll: 34, composerStuck: true },
    { saveAtPoll: 34, wrongProject: true },
    { saveAtPoll: 34, wrongCanonicalProject: true },
  ])("Issue #53: Project provisional stays UNKNOWN without one owned message and canonical target (%j)", async flags => {
    let clock = 0;
    const f = fixture({ siteBubble: true, projectFirstChat: true, pendingFirstChat: true,
      onWait: ms => { clock += ms; }, ...flags });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0], "SYNTHETIC_PROJECT_NOT_PROVEN_53"))
      .rejects.toMatchObject({ code: "DISPATCH_AMBIGUOUS" });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(clock).toBeLessThanOrEqual(12_200);
  });

  it("Issue #53 RED: canonical Project alias is accepted only after source equality and read-only membership", async () => {
    let clock = 0;
    const f = fixture({ siteBubble: true, pendingFirstChat: true, projectFirstChat: true,
      projectAlias: true, memberFound: true, saveAtPoll: 15, onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],
      "SYNTHETIC_PROJECT_ALIAS_MEMBERSHIP_PROOF")).resolves.toEqual(expect.any(Number));
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(f.page.context).toHaveBeenCalled();
  });
  it.each([
    { memberFound: false },
    { memberFound: true, memberWrongId: true },
    { memberFound: true, postedDifferentText: true },
    { memberFound: true, concurrentNewTurn: true },
    { memberFound: true, composerStuck: true },
  ])("Issue #53 alias cannot be attributed without membership and exact unique User Turn (%j)", async flags => {
    let clock = 0;
    const f = fixture({siteBubble:true,pendingFirstChat:true,projectFirstChat:true,
      projectAlias:true,saveAtPoll:15,onWait:ms=>{clock+=ms;},...flags});
    vi.spyOn(Date,"now").mockImplementation(()=>clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],
      "SYNTHETIC_PROJECT_ALIAS_NOT_VERIFIED")).rejects.toMatchObject({code:"DISPATCH_AMBIGUOUS"});
    expect(f.calls.filter(x=>x==="send")).toHaveLength(1);
  });
  it.each([
    { scenario: "temporary expand click failure", expandClickFailsOnce: true },
    { scenario: "canonical remount refolds bubble", refoldOnSave: true },
    { scenario: "Show more appears after base post-click deadline", lateShowMoreAtPoll: 31 },
  ])("Issue #55 RED: 11,831-char Project alias folded Turn eventually validates after %s", async flags => {
    let clock = 0;
    const f = fixture({siteBubble:true,projectFirstChat:true,projectAlias:true,pendingFirstChat:true,
      saveAtPoll:14,memberFound:true,collapseLong:true,onWait:ms=>{clock+=ms;},...flags});
    vi.spyOn(Date,"now").mockImplementation(()=>clock);
    const source="SYNTHETIC_LONG_PROJECT_55:"+("A".repeat(11_831-26));
    expect(source.length).toBe(11_831);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],source))
      .resolves.toEqual(expect.any(Number));
    expect(f.calls.filter(v=>v==="send")).toHaveLength(1);
    expect(f.calls.filter(v=>v==="expand").length).toBeGreaterThanOrEqual(1);
  });
  it.each([
    { noExpand:true },
    { expandWrongText:true },
    { concurrentNewTurn:true },
    { composerStuck:true },
    { memberFound:false },
  ])("Issue #55: even a matching folded prefix is never a submission receipt without full ownership (%j)", async flags => {
    let clock=0;
    const f=fixture({siteBubble:true,projectFirstChat:true,projectAlias:true,pendingFirstChat:true,
      saveAtPoll:14,memberFound:true,collapseLong:true,onWait:ms=>{clock+=ms;},...flags});
    vi.spyOn(Date,"now").mockImplementation(()=>clock);
    const source="SYNTHETIC_LONG_PROJECT_NEGATIVE_55:"+("B".repeat(11_831-35));
    expect(source.length).toBe(11_831);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],source))
      .rejects.toMatchObject({code:"DISPATCH_AMBIGUOUS"});
    expect(f.calls.filter(v=>v==="send")).toHaveLength(1);
  });

  const remountCounts = [
    2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
  ];
  it("Issue #57 RED: 0→2→0→1 Project canonical hydration yields exactly one full owned saved Turn", async () => {
    let clock = 0;
    const f = fixture({ siteBubble: true, projectFirstChat: true, projectAlias: true,
      pendingFirstChat: true, saveAtPoll: 2, memberFound: true,
      postClickBubbleCounts: remountCounts, onWait: ms => { clock += ms; } });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],
      "ISSUE57_CANONICAL_HYDRATED_UNIQUE_EXACT_SOURCE")).resolves.toEqual(expect.any(Number));
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(clock).toBeLessThanOrEqual(12_200);
    expect(f.page.context).toHaveBeenCalled();
  });
  it.each([
    { scenario: "two genuine saved User Turns", readbackTurnCount: 2 },
    { scenario: "foreign saved User Turn", readbackWrongText: true },
    { scenario: "original Project has no membership", memberFound: false },
    { scenario: "saved ID belongs to another Project", memberWrongId: true },
    { scenario: "different message was submitted", postedDifferentText: true },
    { scenario: "Composer retains a draft", composerStuck: true },
    { scenario: "canonical User never hydrates", postClickBubbleCounts: [2, 2, ...Array(42).fill(0)] },
    { scenario: "wrong-origin navigation", wrongOrigin: true, pendingFirstChat: false },
  ])("Issue #57 hydration MUST remain UNKNOWN: $scenario", async flags => {
    let clock = 0;
    const f = fixture({ siteBubble: true, projectFirstChat: true, projectAlias: true,
      pendingFirstChat: true, saveAtPoll: 2, memberFound: true,
      postClickBubbleCounts: remountCounts, onWait: ms => { clock += ms; }, ...flags });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await expect(sendChatGptPrompt(f.page as unknown as Parameters<typeof sendChatGptPrompt>[0],
      "ISSUE57_NEVER_CONFIRM_UNPROVEN_SAVED_USER_TURN")).rejects.toMatchObject({code:"DISPATCH_AMBIGUOUS"});
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([
    { pendingFirstChat: true, saveAtPoll: undefined },
    { pendingFirstChat: true, saveAtPoll: 34, postedDifferentText: true },
    { pendingFirstChat: true, saveAtPoll: 34, concurrentNewTurn: true },
    { pendingFirstChat: true, saveAtPoll: 34, composerStuck: true },
  ])("never promotes an unproven provisional local-chat URL to submitted (#28)", async flags => {
    let clock = 0;
    const f = fixture({ siteBubble: true, onWait: ms => { clock += ms; }, ...flags });
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_PROVISIONAL_DO_NOT_TRUST_URL" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(clock).toBeLessThanOrEqual(12_200);
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


  it("reports privacy-safe turn baselines and observed counts for resumed Send with no new User turn", async () => {
    const f = fixture({ resume: true, siteBubble: true, postClickStuck: true });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const prompt = "SYNTHETIC_RESUMED_DIAGNOSTIC_PRIVATE_CONTENT";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: false, conversationId: ID } } },
    });
    expect(result).toMatchObject({
      status: "ambiguous", reason: "SEND_OUTCOME_UNKNOWN", retryable: false,
      diagnostic: {
        postClickReason: "new_turn_absent",
        turnEvidence: {
          before: { bubbles: 1, legacy: 0 },
          current: { bubbles: 1, legacy: 0 },
          observedNewTurn: false,
          verifiedNewTurn: false,
        },
      },
    });
    const evidence = (result as { diagnostic: { turnEvidence: { checks: number; samples: unknown[] } } }).diagnostic.turnEvidence;
    expect(evidence.checks).toBeGreaterThan(0);
    expect(evidence.samples.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(result)).not.toContain(prompt);
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it.each([
    { caseName: "duplicate content nodes", flags: { contentMatchCount: 2 }, count: 2, read: "ambiguous_content" },
    { caseName: "matching content read rejected", flags: { contentMatchCount: 1, contentReadFailure: true }, count: 1, read: "read_failed" },
    { caseName: "fallback turn read rejected", flags: { contentMatchCount: 0, turnReadFailure: true }, count: 0, read: "read_failed" },
    { caseName: "content selector count rejected", flags: { contentCountFailure: true }, count: -1, read: "selector_failed" },
  ])("Issue #44: diagnoses $caseName without acknowledging or replaying the first Send", async ({ flags, count, read }) => {
    let now = 0;
    const f = fixture({ siteBubble: true, ...flags });
    vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const prompt = "PRIVATE_ISSUE44_TEST_PROMPT_NOT_IN_RECEIPT";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page },
      config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({
      status: "ambiguous", submissionState: "unknown", reason: "SEND_OUTCOME_UNKNOWN", retryable: false,
      diagnostic: {
        postClickReason: "message_unavailable",
        turnEvidence: {
          observedNewTurn: true,
          verifiedNewTurn: false,
          messageInspection: {
            family: "bubble",
            contentMatches: count,
            readOutcome: read,
            provisionalFirstChat: false,
          },
        },
      },
    });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(prompt);
  });

  it("Issue #44 RED: nested content wrapper selects only one outermost complete message", async () => {
    const f = fixture({ siteBubble: true, contentMatchCount: 2, outermostMatchCount: 1 });
    const prompt = "SYNTHETIC_NESTED_PARENT_44";
    const result = await chatgptAdapter.execute("trigger", { prompt }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "triggered", submissionState: "submitted", conversationId: ID });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("Issue #44: two sibling content roots must remain unknown", async () => {
    const f = fixture({ siteBubble: true, contentMatchCount: 2, outermostMatchCount: 2 });
    let now = 0; vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_SIBLING_UNSAFE_44" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false,
      diagnostic: { postClickReason: "message_unavailable",
        turnEvidence: { messageInspection: { contentMatches: 2, readOutcome: "ambiguous_content" } } } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

  it("Issue #44: nested content must not accept unrelated text", async () => {
    const f = fixture({ siteBubble: true, contentMatchCount: 2, outermostMatchCount: 1, postedDifferentText: true });
    let now = 0; vi.spyOn(Date, "now").mockImplementation(() => { now += 750; return now; });
    const result = await chatgptAdapter.execute("trigger", { prompt: "SYNTHETIC_WRONG_NESTED_44" }, {
      browser: { page: f.page }, config: { adapterConfig: { conversation: { newChatEachRun: true } } },
    });
    expect(result).toMatchObject({ status: "ambiguous", submissionState: "unknown", retryable: false,
      diagnostic: { turnEvidence: { messageInspection: { contentMatches: 2, outermostMatches: 1, readOutcome: "read" } } } });
    expect(f.calls.filter(x => x === "send")).toHaveLength(1);
  });

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
