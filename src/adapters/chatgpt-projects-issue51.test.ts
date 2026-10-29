import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { listProjects, openProject, startProjectNewConversation } from "./chatgpt-projects.js";

const VALID_ID = "g-p-testProject_51";
type Options = {
  names?: string[];
  legacy?: boolean;
  sidebarLabels?: (string | null)[];
  projectIds?: (string | null)[];
  redirect?: string;
  composerCount?: number;
  composerEditable?: boolean;
  noModernRoot?: boolean;
};
function fixture(options: Options = {}) {
  const names = options.names ?? ["Sample Project"];
  const sidebarLabels = options.sidebarLabels ?? ["Sample Project"];
  const projectIds = options.projectIds ?? sidebarLabels.map(() => VALID_ID);
  const calls: string[] = [];
  let url = "about:blank";
  const editor = {
    count: vi.fn(async () => options.composerCount ?? 1),
    first: vi.fn(() => editor),
    waitFor: vi.fn(async () => { if ((options.composerCount ?? 1) === 0) throw new Error("composer absent"); }),
    isEditable: vi.fn(async () => options.composerEditable ?? true),
  };
  const modernRow = (index: number) => ({
    locator: vi.fn((selector: string) => {
      if (selector !== "span") throw new Error("Unexpected modern inner selector: " + selector);
      const spans = ["", names[index]];
      return {
        count: vi.fn(async () => spans.length),
        nth: (n: number) => ({ innerText: vi.fn(async () => spans[n]) }),
      };
    }),
  });
  const oldRow = (index: number) => ({
    locator: vi.fn((selector: string) => {
      if (selector !== '[role="gridcell"]') throw Error("Unexpected legacy selector");
      const cell = { innerText: vi.fn(async () => index < 0 ? "Name" : names[index]), click: vi.fn(async () => { calls.push("old-click"); url = "https://chatgpt.com/g/" + VALID_ID + "/project"; }) };
      return {count: vi.fn(async () => 1), first: vi.fn(() => cell)};
    }),
  });
  const modern = {
    count: vi.fn(async () => options.legacy || options.noModernRoot ? 0 : names.length),
    nth: vi.fn((index: number) => modernRow(index)),
  };
  const legacy = {
    count: vi.fn(async () => options.legacy ? names.length + 1 : 0),
    nth: vi.fn((index: number) => oldRow(index - 1)),
    first: vi.fn(() => ({waitFor:vi.fn(async () => { if(!options.legacy) throw Error("old grid absent"); })})),
  };
  const sidebar = {
    count: vi.fn(async () => sidebarLabels.length),
    nth: vi.fn((index: number) => ({
      getAttribute: vi.fn(async (attr: string) => attr === "data-app-action-sidebar-project-label" ? sidebarLabels[index] :
        attr === "data-app-action-sidebar-project-id" ? projectIds[index] : null),
      locator: vi.fn((selector: string) => {
        if (selector === "button") throw new Error("BUG: attempted obsolete sidebar click");
        throw Error("unexpected selector");
      }),
    })),
  };
  const main = {waitFor: vi.fn(async () => undefined)};
  const page = {
    goto: vi.fn(async (destination: string) => {
      calls.push(destination.includes("/projects") ? "projects-goto" : "project-goto");
      url = destination.includes("/projects") ? destination : options.redirect ?? destination;
    }),
    url: vi.fn(() => url),
    title: vi.fn(async () => "ChatGPT"),
    locator: vi.fn((selector: string) => {
      if(selector === "main") return main;
      if(selector === 'main [role="row"]') return legacy;
      if(selector === 'main [data-projects-rows] [data-project-row]') return modern;
      if(selector === "[data-app-action-sidebar-project-row]") return sidebar;
      if(selector.includes("#prompt-textarea") || selector.includes('role="textbox"')) return editor;
      throw new Error("Unknown selector: " + selector);
    }),
    waitForURL: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
  };
  return {page:page as unknown as Page, calls, editor};
}
afterEach(() => vi.restoreAllMocks());
describe("Issue #51 current Projects DOM and owned landing route", () => {
  it("RED: lists the hydrated current data-project-row UI without legacy role=row", async () => {
    const f = fixture({names:["Sample Project", "Second Project"]});
    expect(await listProjects(f.page)).toEqual(["Sample Project","Second Project"]);
  });
  it("RED: does not silently report [] while no supported projects UI hydrated", async () => {
    const f = fixture({names:[], noModernRoot:true, sidebarLabels:[]});
    let tick = 0;
    vi.spyOn(Date,"now").mockImplementation(() => tick += 5500);
    await expect(listProjects(f.page)).rejects.toThrow(/not ready|unavailable|hydrated/i);
  });
  it("keeps the legacy grid scan supported", async () => {
    const f = fixture({legacy:true,names:["Sample Project"]});
    expect(await listProjects(f.page)).toEqual(["Sample Project"]);
  });
  it("rejects duplicate names in the current Projects grid", async () => {
    const f = fixture({names:["Sample Project","Sample Project"]});
    await expect(openProject(f.page,"Sample Project")).rejects.toThrow(/ambiguous/i);
    expect(f.calls).not.toContain("project-goto");
  });
  it("RED: opens exact modern project through validated first-party landing", async () => {
    const f = fixture({names:["Sample Project","Other Project"]});
    await openProject(f.page,"Sample Project");
    expect(f.calls).toContain("project-goto");
    expect(f.calls).not.toContain("old-click");
  });
  it("RED: navigates without obstructed sidebar new-chat button", async () => {
    const f = fixture();
    expect(await startProjectNewConversation(f.page,"Sample Project")).toEqual({projectId:VALID_ID});
    expect(f.calls).toEqual(["projects-goto","project-goto"]);
    expect(f.editor.isEditable).toHaveBeenCalled();
  });
  it.each([
    ["missing ID", {projectIds:[null]}, /id/i],
    ["invalid ID", {projectIds:["g-p-../evil"]}, /invalid|id/i],
    ["duplicate label", {sidebarLabels:["Sample Project","Sample Project"]}, /ambiguous/i],
    ["foreign origin", {redirect:"https://malicious.invalid/g/"+VALID_ID+"/project"}, /origin|unexpected|route/i],
    ["different Project", {redirect:"https://chatgpt.com/g/g-p-other/project"}, /route|unexpected|project/i],
    ["unexpected query", {redirect:"https://chatgpt.com/g/"+VALID_ID+"/project?tab=unknown"}, /route|unexpected/i],
    ["missing Composer", {composerCount:0}, /composer/i],
    ["noneditable Composer", {composerEditable:false}, /editable|composer/i],
  ] as const)("RED: fails closed before Send on %s", async (_name,options,reason) => {
    const f = fixture(options as Options);
    await expect(startProjectNewConversation(f.page,"Sample Project")).rejects.toThrow(reason);
    expect(f.calls.filter(x => x === "send")).toHaveLength(0);
    expect(f.calls.filter(x => x === "old-click")).toHaveLength(0);
  });
});
