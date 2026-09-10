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
