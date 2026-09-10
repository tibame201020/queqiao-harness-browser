import { describe, expect, it } from "vitest";
import { normalizeChatGptAdapterConfig } from "./chatgpt-adapter.js";

describe("ChatGPT adapter config contract", () => {
  it("defaults to non-project, new-chat, no-cleanup", () => {
    const cfg = normalizeChatGptAdapterConfig({});
    expect(cfg.project.enabled).toBe(false);
    expect(cfg.conversation.newChatEachRun).toBe(true);
    expect(cfg.cleanup.enabled).toBe(false);
  });

  it("requires project name only when project mode is enabled", () => {
    expect(() => normalizeChatGptAdapterConfig({ project: { enabled: true } })).toThrow(/project.name/);
    expect(normalizeChatGptAdapterConfig({ project: { enabled: true, name: "Demo" } }).project.name).toBe("Demo");
  });

  it("requires an explicit conversation id when reusing a conversation", () => {
    expect(() => normalizeChatGptAdapterConfig({ conversation: { newChatEachRun: false } })).toThrow(/conversationId/);
    expect(normalizeChatGptAdapterConfig({ conversation: { newChatEachRun: false, conversationId: "123e4567-e89b-12d3-a456-426614174000" } }).conversation.conversationId).toBeTruthy();
  });

  it("keeps cleanup opt-in and project-scoped", () => {
    expect(() => normalizeChatGptAdapterConfig({ cleanup: { enabled: true, maxConversations: 3 } })).toThrow(/project/);
    const cfg = normalizeChatGptAdapterConfig({ project: { enabled: true, name: "Demo" }, cleanup: { enabled: true, maxConversations: 3 } });
    expect(cfg.cleanup).toEqual({ enabled: true, maxConversations: 3 });
  });

  it("rejects project source requirements outside project mode", () => {
    expect(() => normalizeChatGptAdapterConfig({ project: { enabled: false, requiredSourceName: "Rules" } })).toThrow(/requiredSourceName/);
  });
});
