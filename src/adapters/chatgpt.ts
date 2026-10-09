export type ChatConversation = { id: string; title: string; pinned: boolean; href?: string };

export function conversationIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = href.match(/\/c\/([0-9a-f-]{36})(?:$|[/?#])/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function isPinnedAriaLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /^已釘選對話：/.test(label) || /^Pinned chat:/i.test(label);
}

export function selectCleanupCandidates(items: readonly ChatConversation[]): ChatConversation[] {
  return items.filter((item) => !item.pinned);
}

export type AssistantCollectSnapshot = {
  assistantCount: number;
  latestText: string;
  generating: boolean;
};

export type AssistantCollectState = {
  latestText: string;
  assistantCount: number;
  stablePasses: number;
  stableSinceMs: number | null;
  done: boolean;
};

export function initialAssistantCollectState(): AssistantCollectState {
  return { latestText: "", assistantCount: 0, stablePasses: 0, stableSinceMs: null, done: false };
}

export function advanceAssistantCollectScan(
  state: AssistantCollectState,
  snapshot: AssistantCollectSnapshot,
  nowMs = Date.now(),
  minStableMs = 0,
): AssistantCollectState {
  const latestText = snapshot.latestText.trim();
  const canComplete = snapshot.assistantCount > 0 && latestText.length > 0 && !snapshot.generating;
  const unchanged = canComplete && latestText === state.latestText
    && snapshot.assistantCount === state.assistantCount && state.stableSinceMs !== null;
  const stablePasses = unchanged ? state.stablePasses + 1 : 0;
  const stableSinceMs = !canComplete ? null : unchanged ? state.stableSinceMs : nowMs;
  return {
    latestText,
    assistantCount: snapshot.assistantCount,
    stablePasses,
    stableSinceMs,
    done: Boolean(unchanged && stableSinceMs !== null && nowMs - stableSinceMs >= minStableMs),
  };
}
