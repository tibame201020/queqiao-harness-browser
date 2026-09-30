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
  stablePasses: number;
  done: boolean;
};

export function initialAssistantCollectState(): AssistantCollectState {
  return { latestText: "", stablePasses: 0, done: false };
}

export function advanceAssistantCollectScan(
  state: AssistantCollectState,
  snapshot: AssistantCollectSnapshot,
): AssistantCollectState {
  const latestText = snapshot.latestText.trim();
  const canComplete = snapshot.assistantCount > 0 && latestText.length > 0 && !snapshot.generating;
  const stablePasses = canComplete && latestText === state.latestText ? state.stablePasses + 1 : 0;
  return {
    latestText,
    stablePasses,
    done: canComplete && stablePasses >= 1,
  };
}
