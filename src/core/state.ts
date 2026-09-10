export type LeaseState = { lastTriggerAtMs?: number | null };

export function leaseRemainingMs(state: LeaseState, nowMs: number, leaseMs: number): number {
  const last = state.lastTriggerAtMs;
  if (!last) return 0;
  return Math.max(0, leaseMs - (nowMs - last));
}

export type RetentionConversation = { id: string; pinned: boolean };
export type RetentionPolicy = { maxConversations: number; protectedIds: ReadonlySet<string> };

export function selectRetentionCandidates(items: readonly RetentionConversation[], policy: RetentionPolicy): string[] {
  const removable = items.filter((item) => !item.pinned && !policy.protectedIds.has(item.id));
  const removeCount = Math.max(0, items.length - policy.maxConversations);
  if (removeCount === 0) return [];
  return removable.slice(-removeCount).map((item) => item.id);
}
