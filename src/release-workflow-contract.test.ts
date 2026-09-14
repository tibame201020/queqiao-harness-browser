import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release workflow contract", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

  it("publishes only from version tags using OIDC", () => {
    expect(workflow).toContain("tags:");
    expect(workflow).toMatch(/- ['\"]v\*['\"]/);
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
  });

  it("validates the tag against package metadata before publishing", () => {
    expect(workflow).toContain("Validate release tag");
    expect(workflow).toContain("GITHUB_REF_NAME");
    expect(workflow).toContain("package.json");
    expect(workflow).toContain("queqiao.manifest.version");
  });

  it("runs release verification before npm publish", () => {
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm audit --omit=dev --audit-level=moderate");
    expect(workflow).toContain("npm publish --access public");
    expect(workflow.indexOf("npm run check")).toBeLessThan(workflow.indexOf("npm publish --access public"));
  });
});