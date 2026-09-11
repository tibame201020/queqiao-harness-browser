import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import extension, { EXTENSION_VERSION, PUBLIC_TOOLS } from "./index.js";

describe("package manifest contract", () => {
  it("declares exactly the runtime public tools", () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const declared = pkg.queqiao.manifest.contributions.map((item: { tool: string }) => item.tool).sort();
    const runtime = PUBLIC_TOOLS.map((item) => item.name).sort();
    expect(declared).toEqual(runtime);
  });
  it("keeps package and runtime versions in sync", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.version).toBe(EXTENSION_VERSION);
    expect(pkg.queqiao.manifest.version).toBe(EXTENSION_VERSION);
    expect(extension.manifest.version).toBe(EXTENSION_VERSION);
  });

});
