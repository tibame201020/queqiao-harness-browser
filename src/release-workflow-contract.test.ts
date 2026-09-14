import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release workflow contract", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

  it("publishes from a published GitHub Release or explicit workflow dispatch using OIDC", () => {
    expect(workflow).toContain("release:");
    expect(workflow).toContain("types: [published]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
  });

  it("checks out and validates the immutable release tag before publishing", () => {
    expect(workflow).toContain("RELEASE_TAG:");
    expect(workflow).toContain("ref: ${{ env.RELEASE_TAG }}");
    expect(workflow).toContain("Verify immutable release identity");
    expect(workflow).toContain("git tag --points-at HEAD");
    expect(workflow).toContain("package.json");
  });

  it("runs release verification and skips already-published versions before provenance publish", () => {
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm audit --omit=dev --audit-level=moderate");
    expect(workflow).toContain("npm view");
    expect(workflow).toContain("npm publish --provenance --access public");
    expect(workflow.indexOf("npm run check")).toBeLessThan(workflow.indexOf("npm publish --provenance --access public"));
  });
});
