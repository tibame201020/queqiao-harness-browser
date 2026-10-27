import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beginSendAttempt, loadSendAttempt, finishSendAttempt, sendAttemptMatchesProfile } from "./send-attempt.js";

const target = "11111111-1111-4111-8111-111111111111";
const original = "SYNTHETIC_PRIVATE_ORIGINAL_RESUME_MESSAGE";
const baseline = { bubbles: 3, legacy: 0 };
const binding = "a".repeat(64);
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function home() { const h = await fs.mkdtemp(path.join(os.tmpdir(), "issue30-private-attempt-")); roots.push(h); return h; }

describe("private original Send attempt recovery (#30)", () => {
  it("survives process-like reload and preserves ownership data only in private 0600 state", async () => {
    const h = await home();
    const a = await beginSendAttempt(h, "unit", { prompt: original, conversationId: target, browserBinding: binding, baseline });
    const loaded = await loadSendAttempt(h, "unit", a.id);
    expect(loaded).toMatchObject({ id: a.id, status: "unknown", prompt: original, conversationId: target, browserBinding: binding, baseline });
    const stat = await fs.stat(path.join(h, "profiles", "unit", "send-attempts", a.id + ".json"));
    if (process.platform !== "win32") expect(stat.mode & 0o077).toBe(0);
    expect(JSON.stringify({ id: a.id, status: a.status })).not.toContain(original);
  });
  it("is idempotent when confirming one attempt and never accepts foreign profile IDs", async () => {
    const h = await home(), a = await beginSendAttempt(h, "unit", { prompt: original, conversationId: target, browserBinding: binding, baseline });
    await finishSendAttempt(h, "unit", a.id, "submitted");
    const b = await finishSendAttempt(h, "unit", a.id, "submitted");
    expect(b.status).toBe("submitted");
    await expect(loadSendAttempt(h, "other", a.id)).rejects.toThrow();
    await expect(loadSendAttempt(h, "unit", "../escape")).rejects.toThrow();
  });
  it("rejects pending duplicate attempts to prevent a second Send", async () => {
    const h = await home();
    await beginSendAttempt(h, "unit", { prompt: original, conversationId: target, browserBinding: binding, baseline });
    await expect(beginSendAttempt(h, "unit", { prompt: "SECOND_SEND", conversationId: target, browserBinding: binding, baseline }))
      .rejects.toThrow(/pending|unknown|unresolved/i);
  });
});
