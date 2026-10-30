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
  conversationId: string | null;
  projectId?: string;
  observedUrl?: string;
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
function canonicalProjectUrl(raw: string): { id: string } | null {
  const match = /^https:\/\/chatgpt\.com\/g\/g-p-[A-Za-z0-9_-]{1,120}\/c\/([0-9a-f-]{36})$/i.exec(raw);
  return match && validUuid.test(match[1]) ? { id: match[1] } : null;
}

/** Persist the observed saved route of the ORIGINAL click; never supply a guessed ID. */
export async function observeSavedSendAttempt(home: string, profile: string, id: string, url: string): Promise<SendAttempt> {
  const record = await loadSendAttempt(home, profile, id), saved = canonicalProjectUrl(url);
  if (record.conversationId !== null || !record.projectId || !saved
    || record.observedUrl && record.observedUrl !== url) throw new Error("Original saved Project conversation is not attributable");
  const file = paths(home, profile, id).file;
  const updated = { ...record, observedUrl: url };
  const tmp = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(updated), { flag: "wx", mode: 0o600 });
  try { await fs.rename(tmp, file); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
  return updated;
}

export async function loadSendAttempt(home: string, profile: string, id: string): Promise<SendAttempt> {
  const data = JSON.parse(await fs.readFile(paths(home, profile, id).file, "utf8")) as SendAttempt;
  if (data.id !== id || !(data.conversationId && validUuid.test(data.conversationId)
    || data.conversationId === null && /^g-p-[A-Za-z0-9_-]{1,120}$/.test(data.projectId ?? ""))
    || (data.observedUrl !== undefined && !canonicalProjectUrl(data.observedUrl))
    || !/^[0-9a-f]{64}$/.test(data.browserBinding) || !["unknown", "submitted"].includes(data.status)
    || typeof data.prompt !== "string" || (data.status === "unknown" && !data.prompt)
    || !Number.isInteger(data.baseline?.bubbles) || !Number.isInteger(data.baseline?.legacy)
    || data.baseline.bubbles < 0 || data.baseline.legacy < 0) throw new Error("Invalid private Send attempt");
  return data;
}
export async function beginSendAttempt(home: string, profile: string,
  input: { prompt: string; conversationId: string | null; projectId?: string; baseline: TurnBaseline; browserBinding: string }): Promise<SendAttempt> {
  if (!(input.conversationId && validUuid.test(input.conversationId)
    || input.conversationId === null && /^g-p-[A-Za-z0-9_-]{1,120}$/.test(input.projectId ?? "")) || !/^[0-9a-f]{64}$/.test(input.browserBinding) || !input.prompt || input.baseline.bubbles < 0 || input.baseline.legacy < 0)
    throw new Error("Send attempt requires a saved Conversation or original Project and baseline");
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
  let writeError: unknown;
  try { await lock.writeFile(id); } catch (error) { writeError = error; }
  finally { await lock.close(); }
  if (writeError !== undefined) { await fs.rm(active, { force: true }); throw writeError; }
  const data: SendAttempt = {
    id, status: "unknown", prompt: input.prompt, conversationId: input.conversationId, projectId: input.projectId,
    browserBinding: input.browserBinding,
    baseline: { ...input.baseline }, createdAt: new Date().toISOString(),
  };
  try { await fs.writeFile(file, JSON.stringify(data), { flag: "wx", mode: 0o600 }); }
  catch (error) { await fs.rm(active, { force: true }); throw error; }
  return data;
}
export async function finishSendAttempt(home: string, profile: string, id: string, status: "submitted"): Promise<SendAttempt> {
  const record = await loadSendAttempt(home, profile, id);
  const { file, dir } = paths(home, profile, id);
  const releaseActive = async () => {
    const active = path.join(dir, "active.lock");
    const owner = await fs.readFile(active, "utf8").catch(() => null);
    if (owner === id) await fs.rm(active, { force: true });
  };
  if (record.status === status && !record.prompt) { await releaseActive(); return record; }
  const tmp = file + "." + randomUUID() + ".tmp";
  const updated = { ...record, status, prompt: "" }; // scrub source atomically after exact confirmation
  await fs.writeFile(tmp, JSON.stringify(updated), { flag: "wx", mode: 0o600 });
  try { await fs.rename(tmp, file); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
  await releaseActive();
  return updated;
}

export function sendAttemptMatchesProfile(attempt: SendAttempt, browserBinding: string, configuredConversationId: string | null,
  configuredProjectId?: string): boolean {
  return attempt.browserBinding === browserBinding
    && attempt.conversationId === configuredConversationId
    && (attempt.projectId === undefined || attempt.projectId === configuredProjectId);
}

// Recover a possibly-clicked Send after a runner crash between durable file
// creation and writing the per-profile runtime-state pointer. No Send or clear.
export async function activeSendAttemptId(home: string, profile: string): Promise<string | null> {
  const dir = paths(home, profile, "00000000-0000-4000-8000-000000000000").dir;
  const raw = await fs.readFile(path.join(dir, "active.lock"), "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (raw === null) return null;
  if (!validUuid.test(raw)) throw new Error("Invalid private active Send attempt identity");
  await loadSendAttempt(home, profile, raw); // fail closed on a torn pre-click receipt
  return raw;
}
