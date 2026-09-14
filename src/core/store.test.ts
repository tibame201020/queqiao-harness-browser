import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, profilePaths } from "./store.js";

describe("profilePaths", () => {
  it("keeps runtime state outside the repository", () => {
    const paths = profilePaths("C:/runtime", "job-search");
    expect(paths.root).toBe("C:/runtime/profiles/job-search");
    expect(paths.config).toBe("C:/runtime/profiles/job-search/config.json");
    expect(paths.browserProfile).toBe("C:/runtime/profiles/job-search/browser-profile");
  });

  it("normalizes legacy persisted configs so new lifecycle defaults are visible", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "harness-store-"));
    try {
      const configPath = profilePaths(home, "legacy").config;
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({
        name: "legacy",
        adapter: "generic",
        browser: { engine: "chromium", channel: "chrome", headless: true, startMinimized: true, connection: "managed" },
        schedule: { type: "manual" },
        runPolicy: { leaseMinutes: 50, busyRetryMinutes: 5 },
        adapterConfig: { url: "https://example.com" },
      }), "utf8");

      const config = await loadConfig(home, "legacy");
      expect(config.lifecycle).toEqual({ resumePolicy: "manual" });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});
