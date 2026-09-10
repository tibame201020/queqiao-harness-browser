import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const mod = await import("../dist/index.js");
assert.equal(mod.default.manifest.id, "dev.queqiao.harness-browser");
assert.equal(mod.default.manifest.version, pkg.version);
assert.equal(pkg.queqiao.manifest.version, pkg.version);
console.log("PACKAGE_IMPORT_OK");
