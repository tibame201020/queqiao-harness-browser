import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeHarnessConfig, type HarnessConfig } from "./config.js";

export function defaultHarnessHome(): string {
  if (process.env.QUEQIAO_HARNESS_HOME) return process.env.QUEQIAO_HARNESS_HOME;
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Queqiao", "harness-browser");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "queqiao", "harness-browser");
}

export function profilePaths(home: string, name: string) {
  const root = path.posix.join(home.replaceAll("\\", "/"), "profiles", name);
  return { root, config: `${root}/config.json`, state: `${root}/state.json`, browserProfile: `${root}/browser-profile`, supervisorPid: `${root}/supervisor.pid`, stopFlag: `${root}/stop.flag` };
}

export async function saveConfig(home: string, config: HarnessConfig): Promise<void> {
  const p = profilePaths(home, config.name);
  await fs.mkdir(p.root, { recursive: true });
  await fs.writeFile(p.config, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export async function loadConfig(home: string, name: string): Promise<HarnessConfig> {
  return normalizeHarnessConfig(JSON.parse(await fs.readFile(profilePaths(home, name).config, "utf8")));
}

export async function listProfiles(home: string): Promise<string[]> {
  const dir = path.join(home, "profiles");
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; }
}
