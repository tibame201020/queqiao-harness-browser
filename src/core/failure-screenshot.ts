import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { profilePaths } from "./store.js";

export type FailureScreenshot = { status: "saved"; file: string } | { status: "capture_failed" };
type ScreenshotCandidate = {
  status?: string;
  submissionState?: string;
  diagnostic?: { precomposeReason?: string | null; [key: string]: unknown };
};
type WithScreenshot<T extends ScreenshotCandidate> = T & {
  diagnostic: NonNullable<T["diagnostic"]> & {
    failureScreenshot: { status: "saved" | "capture_failed"; file?: string };
  };
};

/** Capture the original owned page while it is still alive, before lifecycle close.
 *  Screenshots can contain conversation/account details: keep bytes in the local
 *  private Harness home, never in repository files or upstream Bridge results.
 *  Failure to capture is diagnostic only and cannot reclassify a not_sent Send.
 */
export async function captureComposerAbsentFailure<T extends ScreenshotCandidate>(
  page: Pick<Page, "screenshot">,
  home: string,
  profileName: string,
  value: T,
): Promise<WithScreenshot<T>> {
  if (value.status !== "unavailable" || value.submissionState !== "not_sent"
    || value.diagnostic?.precomposeReason !== "composer_absent") {
    return value as WithScreenshot<T>;
  }

  let failureScreenshot: FailureScreenshot;
  try {
    const directory = path.join(profilePaths(home, profileName).root, "private-diagnostics");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = `composer-absent-${randomUUID()}.png`;
    // Do not pass a path into Playwright: write in the local private directory
    // ourselves with restricted create permissions.
    const image = await page.screenshot({ type: "png", animations: "disabled", timeout: 5_000 });
    await fs.writeFile(path.join(directory, file), image, { flag: "wx", mode: 0o600 });
    failureScreenshot = { status: "saved", file };
  } catch {
    // Preserve the original PRE_SEND_NOT_READY outcome and its exact diagnostics.
    failureScreenshot = { status: "capture_failed" };
  }
  return {
    ...value,
    diagnostic: { ...value.diagnostic, failureScreenshot },
  } as WithScreenshot<T>;
}
