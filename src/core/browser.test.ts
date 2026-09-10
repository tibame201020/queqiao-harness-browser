import { describe, expect, it } from "vitest";
import { browserCandidates, managedBrowserArgs, resolveBrowserExecutable } from "./browser.js";

describe("browser executable discovery", () => {
  it("keeps Chromium brands behind one browser runtime", () => {
    const env = { PROGRAMFILES: "C:/Program Files", "PROGRAMFILES(X86)": "C:/Program Files (x86)", LOCALAPPDATA: "C:/Users/u/AppData/Local" };
    expect(browserCandidates("chrome", "win32", env)[0]).toContain("Google/Chrome/Application/chrome.exe");
    expect(browserCandidates("edge", "win32", env)[0]).toContain("Microsoft/Edge/Application/msedge.exe");
    expect(browserCandidates("brave", "win32", env)[0]).toContain("BraveSoftware/Brave-Browser/Application/brave.exe");
  });

  it("honors an explicit executable path before discovery", () => {
    expect(resolveBrowserExecutable({ channel: "chrome", executablePath: "D:/Chrome/chrome.exe" }, { exists: () => true })).toBe("D:/Chrome/chrome.exe");
  });
  it("rejects explicit non-browser executables", () => {
    expect(() => resolveBrowserExecutable({ channel: "chrome", executablePath: "D:/Tools/powershell.exe" }, { exists: () => true })).toThrow(/browser executable/i);
  });

  it("minimizes headed background runs but not headless runs", () => {
    expect(managedBrowserArgs({ headless: false, startMinimized: true })).toContain("--start-minimized");
    expect(managedBrowserArgs({ headless: true, startMinimized: true })).not.toContain("--start-minimized");
  });

});
