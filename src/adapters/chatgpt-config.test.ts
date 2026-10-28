import { describe, expect, it } from "vitest";
import { normalizeChatGptAdapterConfig, selectChatGptTriggerConfig } from "./chatgpt-adapter.js";

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

describe("runtime conversation destination", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const url = "https://chatgpt.com/c/" + id;
  const args = {prompt:"synthetic only",conversationId:id,conversationUrl:url};
  it("defaults to disabled and preserves existing new-chat behavior", () => {
    const cfg=normalizeChatGptAdapterConfig({});
    expect(selectChatGptTriggerConfig(cfg,{prompt:"x"})).toEqual(cfg);
    expect(() => selectChatGptTriggerConfig(cfg,args)).toThrow(/RUNTIME_TARGET_DISABLED/);
  });
  it("uses exactly the supplied verified conversation with explicit profile opt-in", () => {
    const cfg=normalizeChatGptAdapterConfig({conversation:{newChatEachRun:true,allowRuntimeTarget:true}});
    const target=selectChatGptTriggerConfig(cfg,args);
    expect(target.conversation.newChatEachRun).toBe(false);
    expect(target.conversation.conversationId).toBe(id);
    expect(cfg.conversation.newChatEachRun).toBe(true);
  });
  it("accepts a canonical Project URL as an explicitly opted-in per-run target", () => {
    const cfg=normalizeChatGptAdapterConfig({conversation:{newChatEachRun:true,allowRuntimeTarget:true}});
    const projectUrl="https://chatgpt.com/g/g-p-synthetic-project/c/"+id;
    const target=selectChatGptTriggerConfig(cfg,{...args,conversationUrl:projectUrl});
    expect(target.conversation).toMatchObject({newChatEachRun:false,conversationId:id});
    expect(cfg.conversation.newChatEachRun).toBe(true);
  });
  it("rejects noncanonical, foreign and mismatched Project URLs", () => {
    const cfg=normalizeChatGptAdapterConfig({conversation:{newChatEachRun:true,allowRuntimeTarget:true}});
    for(const projectUrl of [
      "https://chatgpt.com/g/g-p-synthetic-project/c/"+other,
      "https://chatgpt.com/g/g-p-synthetic-project/c/"+id+"?tab=1",
      "https://chatgpt.com/g/g-p-synthetic-project/c/"+id+"#anchor",
      "https://chatgpt.com/g/g-p-synthetic-project/c/"+id+"/",
      "https://chatgpt.com/g/g-p-synthetic-project/c/"+id+"/extra",
      "https://chatgpt.com:443/g/g-p-synthetic-project/c/"+id,
      "https://evil.example/g/g-p-synthetic-project/c/"+id,
      "http://chatgpt.com/g/g-p-synthetic-project/c/"+id,
      "https://chatgpt.com/g/../c/"+id,
    ]) expect(()=>selectChatGptTriggerConfig(cfg,{...args,conversationUrl:projectUrl})).toThrow();
  });
  it("rejects partial, foreign, malformed and incompatible configured project targets before touching the browser", () => {
    const cfg=normalizeChatGptAdapterConfig({conversation:{newChatEachRun:true,allowRuntimeTarget:true}});
    for(const bad of [
      {conversationId:id}, {conversationUrl:url},
      {...args,conversationId:other},
      {...args,conversationUrl:"https://malicious.invalid/c/"+id},
      {...args,conversationUrl:url+"?x=1"},
      {...args,conversationId:"not-uuid"},
    ]) expect(()=>selectChatGptTriggerConfig(cfg,bad)).toThrow();
    const project=normalizeChatGptAdapterConfig({project:{enabled:true,name:"Synthetic"},
      conversation:{newChatEachRun:true,allowRuntimeTarget:true}});
    expect(()=>selectChatGptTriggerConfig(project,args)).toThrow(/RUNTIME_TARGET_UNSUPPORTED/);
    const configured=normalizeChatGptAdapterConfig({conversation:{newChatEachRun:false,
      conversationId:other,allowRuntimeTarget:true}});
    expect(()=>selectChatGptTriggerConfig(configured,args)).toThrow(/RUNTIME_TARGET_UNSUPPORTED/);
  });
});
