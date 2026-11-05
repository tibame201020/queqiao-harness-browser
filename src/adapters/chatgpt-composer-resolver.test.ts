import { describe, expect, it, vi } from "vitest";
import { resolveChatGptComposer } from "./chatgpt-composer-resolver.js";

function fixture(options: { css?:number; semantic?:number; editable?:boolean; visible?:boolean; form?:number; send?:number } = {}) {
  const send = { count: vi.fn(async () => options.send ?? 1) };
  const form = { count: vi.fn(async () => options.form ?? 1), locator: vi.fn(() => send) };
  const semantic = {
    count: vi.fn(async () => options.semantic ?? 1),
    first() {return this;},
    isVisible: vi.fn(async () => options.visible ?? true),
    evaluate: vi.fn(async () => options.editable ?? true),
    locator: vi.fn(() => form),
  };
  const css = { count: vi.fn(async () => options.css ?? 0), first() {return this;} };
  const page = { locator: vi.fn(() => css), getByRole: vi.fn(() => semantic) };
  return { page, css, semantic, send, form };
}
describe("Issue #68 in-process Playwright Accessibility fallback", () => {
  it("preserves the existing CSS primary path", async () => {
    const f=fixture({css:1});
    const resolved=await resolveChatGptComposer(f.page as never);
    expect(resolved).toEqual({matches:1,composer:f.css,source:"css"});
    expect(f.page.getByRole).not.toHaveBeenCalled();
  });
  it("RED: re-acquires one accessible editable Composer when CSS selector drifted", async () => {
    const f=fixture();
    const resolved=await resolveChatGptComposer(f.page as never);
    expect(resolved).toEqual({matches:1,composer:f.semantic,source:"aria"});
    expect(f.page.getByRole).toHaveBeenCalledWith("textbox");
    expect(f.semantic.evaluate).toHaveBeenCalledOnce();
  });
  it("observes the unique editor after Send becomes Stop, without permitting pre-send recovery", async () => {
    const f=fixture({send:0});
    expect((await resolveChatGptComposer(f.page as never)).composer).toBeNull();
    const result=await resolveChatGptComposer(f.page as never,{observationOnly:true});
    expect(result).toMatchObject({source:"aria",matches:1,composer:f.semantic});
  });
  it.each([
    ["ambiguous CSS", {css:2}, "ambiguous"],
    ["duplicate semantic targets", {semantic:2}, "none"],
    ["noneditable native DOM", {editable:false}, "none"],
    ["hidden candidate", {visible:false}, "none"],
    ["unbound form", {form:0}, "none"],
    ["multiple submits", {send:2}, "none"],
    ["no semantic target", {semantic:0}, "none"],
  ] as const)("fails closed for %s", async (_label, opts, source) => {
    const f=fixture(opts);
    const resolved=await resolveChatGptComposer(f.page as never);
    expect(resolved.source).toBe(source);
    expect(resolved.composer).toBeNull();
  });
});
