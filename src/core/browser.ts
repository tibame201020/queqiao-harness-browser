import fs from "node:fs";
import path from "node:path";

export type ChromiumChannel = "chrome" | "edge" | "brave" | "chromium";

export function browserCandidates(channel: ChromiumChannel, platform = process.platform, env: Record<string, string | undefined> = process.env): string[] {
  if (platform === "win32") {
    const pf = env.PROGRAMFILES || "C:/Program Files";
    const pf86 = env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)";
    const local = env.LOCALAPPDATA || "";
    const rel = channel === "chrome" ? "Google/Chrome/Application/chrome.exe"
      : channel === "edge" ? "Microsoft/Edge/Application/msedge.exe"
      : channel === "brave" ? "BraveSoftware/Brave-Browser/Application/brave.exe"
      : "Chromium/Application/chrome.exe";
    return [path.posix.join(pf.replaceAll("\\", "/"), rel), path.posix.join(pf86.replaceAll("\\", "/"), rel), path.posix.join(local.replaceAll("\\", "/"), rel)].filter(Boolean);
  }
  if (platform === "darwin") {
    const app = channel === "chrome" ? "Google Chrome.app/Contents/MacOS/Google Chrome"
      : channel === "edge" ? "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      : channel === "brave" ? "Brave Browser.app/Contents/MacOS/Brave Browser"
      : "Chromium.app/Contents/MacOS/Chromium";
    return [`/Applications/${app}`];
  }
  return channel === "chrome" ? ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
    : channel === "edge" ? ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"]
    : channel === "brave" ? ["/usr/bin/brave-browser", "/usr/bin/brave"]
    : ["/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

function isAllowedBrowserExecutable(channel: ChromiumChannel, executablePath: string): boolean {
  const base = path.basename(executablePath).toLowerCase();
  const allowed: Record<ChromiumChannel, readonly string[]> = {
    chrome: ["chrome", "chrome.exe", "google-chrome", "google-chrome-stable"],
    edge: ["msedge", "msedge.exe", "microsoft-edge", "microsoft-edge-stable"],
    brave: ["brave", "brave.exe", "brave-browser", "brave-browser.exe"],
    chromium: ["chromium", "chromium.exe", "chromium-browser", "chrome", "chrome.exe"],
  };
  return allowed[channel].includes(base);
}


export function managedBrowserArgs(input: { headless: boolean; startMinimized: boolean }): string[] {
  const args = ["--no-first-run", "--no-default-browser-check", "--disable-default-apps"];
  if (!input.headless && input.startMinimized) args.push("--start-minimized");
  return args;
}

export function resolveBrowserExecutable(input: { channel: ChromiumChannel; executablePath?: string }, io: { exists(path: string): boolean } = { exists: fs.existsSync }): string {
  if (input.executablePath) {
    if (!isAllowedBrowserExecutable(input.channel, input.executablePath)) throw new Error(`Explicit path is not a recognized ${input.channel} browser executable: ${input.executablePath}`);
    if (!io.exists(input.executablePath)) throw new Error(`Browser executable not found: ${input.executablePath}`);
    return input.executablePath;
  }
  for (const candidate of browserCandidates(input.channel)) if (io.exists(candidate)) return candidate;
  throw new Error(`No browser executable found for channel: ${input.channel}`);
}
