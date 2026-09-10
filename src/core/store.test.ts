import { describe, expect, it } from "vitest";
import { profilePaths } from "./store.js";

describe("profilePaths", () => {
  it("keeps runtime state outside the repository", () => {
    const paths = profilePaths("C:/runtime", "job-search");
    expect(paths.root).toBe("C:/runtime/profiles/job-search");
    expect(paths.config).toBe("C:/runtime/profiles/job-search/config.json");
    expect(paths.browserProfile).toBe("C:/runtime/profiles/job-search/browser-profile");
  });
});
