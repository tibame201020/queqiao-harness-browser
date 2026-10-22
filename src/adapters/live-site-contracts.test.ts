import { describe, expect, it } from "vitest";
import { claudeSite } from "./claude-adapter.js";
import { mistralSite } from "./mistral-adapter.js";
import { grokSite } from "./grok-adapter.js";
import { conversationIdentity, safeConversationUrl } from "./web-chat.js";

// Contract selectors recorded from an authorized headed-browser UI inspection.
// These are contract fixtures; never save authenticated HTML, cookies or user messages.
describe("observed authenticated provider DOM contracts", () => {
  it("Claude uses the live editor, send button and assistant testids", () => {
    expect(claudeSite.editor).toContain('[data-testid="chat-input"]');
    expect(claudeSite.send).toContain('[data-testid="chat-input-send"]');
    expect(claudeSite.assistant).toContain('[data-testid="assistant-message"]');
    expect(conversationIdentity(claudeSite, "https://claude.ai/chat/11111111-2222-4333-8444-555555555555")).toBe("11111111-2222-4333-8444-555555555555");
  });
  it("Mistral uses the current Vibe Work route, ProseMirror form and answer parts", () => {
    expect(mistralSite.bootstrapUrl).toBe("https://chat.mistral.ai/work");
    expect(mistralSite.newChatUrl).toBe("https://chat.mistral.ai/work");
    expect(mistralSite.editor).toContain('form [contenteditable="true"].ProseMirror');
    expect(mistralSite.send).toContain('button[aria-label="Send"]');
    expect(mistralSite.assistant).toContain('[data-message-part-type="answer"]');
    expect(mistralSite.working).toContain('[data-testid="harness-steps-summary"]');
    const raw="https://chat.mistral.ai/work/66666666-7777-4888-8999-aaaaaaaaaaaa";
    const id="66666666-7777-4888-8999-aaaaaaaaaaaa";
    expect(conversationIdentity(mistralSite,raw)).toBe(id);
    expect(safeConversationUrl(mistralSite,raw,id)).toBe(raw);
    expect(conversationIdentity(mistralSite,"https://chat.mistral.ai/work/temporary-chat")).toBeNull();
  });
  it("Grok uses its actual localized form composer, submit control and /c/ URLs", () => {
    expect(grokSite.editor).toContain('form[data-composer="true"]');
    expect(grokSite.editor).toContain('[role="combobox"]');
    expect(grokSite.editor).toContain('[role="textbox"]');
    expect(grokSite.send).toContain('[data-testid="chat-submit"]');
    expect(grokSite.assistant).toContain('[data-testid="assistant-message"]');
    const raw="https://grok.com/c/bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    expect(conversationIdentity(grokSite,raw+"?rid=tracking")).toBe("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");
    expect(() => safeConversationUrl(grokSite,raw+"?rid=tracking","bbbbbbbb-cccc-4ddd-8eee-ffffffffffff")).toThrow(/canonical/);
  });
});
