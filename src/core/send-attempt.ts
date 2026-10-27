import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { profilePaths } from "./store.js";

// Original prompt is private runtime state, never part of the MCP result or repository.
// The read-only resume action needs the entire original source to verify Markdown render fidelity.
export type TurnBaseline = { bubbles: number; legacy: number };
export type SendAttempt = {
  id: string;
  status: "unknown" | "submitted";
  prompt: string;
  conversationId: string;
  browserBinding: string;
  baseline: TurnBaseline;
  createdAt: string;
};
const validName = /^[A-Za-z0-9._-]{1,64}$/;
const validUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function paths(home: string, profile: string, id: string) {
  if (!validName.test(profile) || !validUuid.test(id)) throw new Error("Invalid private Send attempt identity");
  const dir = path.join(profilePaths(home, profile).root, "send-attempts");
  return { dir, file: path.join(dir, id + ".json") };
}
export async function loadSendAttempt(home: string, profile: string, id: string): Promise<SendAttempt> {
  const data = JSON.parse(await fs.readFile(paths(home, profile, id).file, "utf8")) as SendAttempt;
  if (data.id !== id || !validUuid.test(data.conversationId) || !/^[0-9a-f]{64}$/.test(data.browserBinding) || !["unknown", "submitted"].includes(data.status)
    || typeof data.prompt !== "string" || !data.prompt
    || !Number.isInteger(data.baseline?.bubbles) || !Number.isInteger(data.baseline?.legacy)
    || data.baseline.bubbles < 0 || data.baseline.legacy < 0) throw new Error("Invalid private Send attempt");
  return data;
}
export async function beginSendAttempt(home: string, profile: string,
  input: { prompt: string; conversationId: string; baseline: TurnBaseline; browserBinding: string }): Promise<SendAttempt> {
  if (!validUuid.test(input.conversationId) || !/^[0-9a-f]{64}$/.test(input.browserBinding) || !input.prompt || input.baseline.bubbles < 0 || input.baseline.legacy < 0)
    throw new Error("Resume attempt requires an existing saved Conversation and verified baseline");
  const id = randomUUID(), { dir, file } = paths(home, profile, id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Exclusive lock prevents two concurrent Runner processes from claiming the same
  // owned profile before either one has persisted its one-click receipt.
  const active = path.join(dir, "active.lock");
  let lock: import("node:fs/promises").FileHandle;
  try { lock = await fs.open(active, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("Unresolved pending original Send must be reconciled, never resent");
    throw error;
  }
  try { await lock.writeFile(id); } finally { await lock.close(); }
  const data: SendAttempt = {
    id, status: "unknown", prompt: input.prompt, conversationId: input.conversationId, browserBinding: input.browserBinding,
    baseline: { ...input.baseline }, createdAt: new Date().toISOString(),
  };
  try { await fs.writeFile(file, JSON.stringify(data), { flag: "wx", mode: 0o600 }); }
  catch (error) { await fs.rm(active, { force: true }); throw error; }
  return data;
}
export async function finishSendAttempt(home: string, profile: string, id: string, status: "submitted"): Promise<SendAttempt> {
  const record = await loadSendAttempt(home, profile, id);
  if (record.status === status) return record;
  const file = paths(home, profile, id).file, tmp = file + "." + randomUUID() + ".tmp";
  const updated = { ...record, status };
  await fs.writeFile(tmp, JSON.stringify(updated), { flag: "wx", mode: 0o600 });
  try { await fs.rename(tmp, file); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
  const active = path.join(paths(home, profile, id).dir, "active.lock");
  const owner = await fs.readFile(active, "utf8").catch(() => null);
  if (owner === id) await fs.rm(active, { force: true });
  return updated;
}

export function sendAttemptMatchesProfile(attempt: SendAttempt, browserBinding: string, configuredConversationId: string | null): boolean {
  return attempt.browserBinding === browserBinding
    && attempt.conversationId === configuredConversationId;
}
