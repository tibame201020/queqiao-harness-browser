import { describe, expect, it, vi } from "vitest";
import { resolveSemanticEditor } from "./semantic-editor.js";

function fixture(options: { css?: number; role?: number; edit?: boolean; form?: number; send?: number; visible?: boolean } = {}) {
  const send = { count: vi.fn(async () => options.send ?? 1) };
  const form = { count: vi.fn(async () => options.form ?? 1), locator: vi.fn(() => send) };
  const editor = { count: vi.fn(async () => options.role ?? 1), first: vi.fn(function(this: unknown) {return this;}),
    isVisible: vi.fn(async () => options.visible ?? true),
    evaluate: vi.fn(async () => options.edit ?? true), locator: vi.fn(() => form),
    and: vi.fn(function(this: unknown) {return this;}) };
  const css = { count: vi.fn(async () => options.css ?? 0), first() {return this;} };
  const page = { locator: vi.fn(() => css), getByRole: vi.fn((role:string) => role === "textbox" ? editor : {...editor,count:vi.fn(async () => 0)}) };
  return {page,css,editor,form,send};
}
const contract = { css:"#provider-editor", roles:["textbox","combobox"] as const, sendWithinForm:"button[data-action=send]" };
describe("shared Browser Accessibility resolution",()=>{
  it("uses CSS first without semantic probing",async()=>{
    const f=fixture({css:1});const x=await resolveSemanticEditor(f.page as never, contract);
    expect(x).toMatchObject({source:"css",matches:1,editor:f.css});
    expect(f.page.getByRole).not.toHaveBeenCalled();
  });
  it("recovers from provider selector drift via role and form ownership",async()=>{
    const f=fixture(); const x=await resolveSemanticEditor(f.page as never,contract);
    expect(x).toMatchObject({source:"aria",matches:1,editor:f.editor});
    expect(f.page.getByRole).toHaveBeenCalledWith("textbox");
    expect(f.editor.first).not.toHaveBeenCalled();
    expect(f.editor.and).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{css:2},"ambiguous"],[{role:0},"none"],[{role:2},"none"],
    [{edit:false},"none"],[{form:0},"none"],[{send:0},"none"],
    [{send:2},"none"],[{visible:false},"none"]
  ] as const)("fails closed on ambiguity/unusable controls",async(opts,source)=>{
    const f=fixture(opts);const x=await resolveSemanticEditor(f.page as never,contract);
    expect(x.source).toBe(source);expect(x.editor).toBeNull();
  });
  it("does not treat a failed CSS count as a zero-match permission to recover",async()=>{
    const f=fixture();f.css.count.mockRejectedValueOnce(new Error("detached page"));
    const x=await resolveSemanticEditor(f.page as never,contract);
    expect(x).toMatchObject({source:"none",editor:null});
    expect(f.page.getByRole).not.toHaveBeenCalled();
  });
  it("rejects when two roles are present across textbox and combobox",async()=>{
    const f=fixture(); f.page.getByRole=vi.fn((role)=>({...f.editor,count:vi.fn(async()=>role==="textbox"?1:1)}));
    const x=await resolveSemanticEditor(f.page as never,contract);
    expect(x).toMatchObject({source:"none",editor:null});
  });
});
