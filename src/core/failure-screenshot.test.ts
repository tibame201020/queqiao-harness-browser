import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureComposerAbsentFailure } from "./failure-screenshot.js";
import { profilePaths } from "./store.js";

const dirs: string[] = [];
async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "issue68-private-shot-"));
  dirs.push(home);
  const page = { screenshot: vi.fn(async () => Buffer.from("safe-synthetic-viewport")) };
  return { page, home, profileName: "synthetic-profile" };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { force: true, recursive: true })));
});

describe("Issue #68 original-tab screenshot at terminal Composer absence", () => {
  it("RED: captures the original page exactly once before it can be closed; stores bytes outside repository", async () => {
    const input = { status: "unavailable", submissionState: "not_sent",
      diagnostic: { stage: "precompose", precomposeReason: "composer_absent", sameTarget: true } };
    const f = await fixture();
    const result = await captureComposerAbsentFailure(f.page, f.home, f.profileName, input);
    expect(f.page.screenshot).toHaveBeenCalledExactlyOnceWith({
      type: "png", animations: "disabled", timeout: 5_000,
    });
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent",
      diagnostic: { precomposeReason: "composer_absent", failureScreenshot: { status: "saved" } } });
    const file = result.diagnostic.failureScreenshot.file;
    expect(file).toMatch(/^composer-absent-[0-9a-f-]{36}\.png$/);
    if (!file) throw new Error("Expected saved screenshot file");
    const savedPath = path.join(profilePaths(f.home, f.profileName).root, "private-diagnostics", file);
    expect(await fs.readFile(savedPath)).toEqual(Buffer.from("safe-synthetic-viewport"));
    if (process.platform !== "win32") {
      expect((await fs.stat(savedPath)).mode & 0o777).toBe(0o600);
    }
  });

  it("captures the original noneditable Composer state without changing not_sent", async () => {
    const f = await fixture();
    const input = { status: "unavailable", submissionState: "not_sent",
      diagnostic: { stage: "precompose", precomposeReason: "composer_uneditable", composerMatches: 1,
        composerVisible: true, composerEditable: false, sameTarget: true } };
    const result = await captureComposerAbsentFailure(f.page, f.home, f.profileName, input);
    expect(f.page.screenshot).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "unavailable", submissionState: "not_sent",
      diagnostic: { precomposeReason: "composer_uneditable", failureScreenshot: { status: "saved" } } });
    const file = result.diagnostic.failureScreenshot.file;
    expect(file).toMatch(/^composer-uneditable-[0-9a-f-]{36}[.]png$/);
    if (!file) throw new Error("Expected private screenshot");
    const savedPath = path.join(profilePaths(f.home, f.profileName).root, "private-diagnostics", file);
    expect(await fs.readFile(savedPath)).toEqual(Buffer.from("safe-synthetic-viewport"));
  });

  it("never captures a successful Send or any post-click unknown", async () => {
    const f = await fixture();
    for (const input of [
      {status:"triggered", submissionState:"submitted", diagnostic:{precomposeReason:null}},
      {status:"ambiguous", submissionState:"unknown", diagnostic:{precomposeReason:"composer_absent"}},
      {status:"unavailable", submissionState:"not_sent", diagnostic:{precomposeReason:"editor_read_failed"}},
      {status:"unavailable", submissionState:"not_sent", diagnostic:{precomposeReason:"composer_click_failed"}},
    ]) {
      expect(await captureComposerAbsentFailure(f.page, f.home, f.profileName, input)).toEqual(input);
    }
    expect(f.page.screenshot).not.toHaveBeenCalled();
  });

  it("screenshot errors never change the original not_sent outcome", async () => {
    const f = await fixture();
    f.page.screenshot.mockRejectedValueOnce(new Error("transient capture failure"));
    const input = {status:"unavailable",submissionState:"not_sent",diagnostic:{precomposeReason:"composer_absent"}};
    const result = await captureComposerAbsentFailure(f.page, f.home, f.profileName, input);
    expect(result).toMatchObject({ status:"unavailable", submissionState:"not_sent",
      diagnostic:{precomposeReason:"composer_absent",failureScreenshot:{status:"capture_failed"}} });
    expect(result.diagnostic.failureScreenshot).not.toHaveProperty("file");
  });
});
