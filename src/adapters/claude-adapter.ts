import { createWebChatAdapter, type WebChatSite } from "./web-chat.js";
export const claudeSite:WebChatSite = {
 id:"claude",origin:"https://claude.ai",bootstrapUrl:"https://claude.ai/new",newChatUrl:"https://claude.ai/new",
 conversationPaths:["chat"],editor:'[contenteditable="true"].ProseMirror:visible, [data-testid="chat-input"] [contenteditable="true"]:visible',
 send:'button[aria-label="Send message"]:visible, button[data-testid="send-button"]:visible',
 assistant:'[data-testid="assistant-message"], .font-claude-response',
 stop:'button[aria-label*="Stop"]:visible, button[data-testid="stop-button"]:visible',
 login:'a[href*="/login"]:visible, button:has-text("Log in"):visible',
 loading:'[role="progressbar"]:visible, [aria-busy="true"]:visible',
 loadError:'[role="alert"]:has-text("failed to load"):visible, [role="alert"]:has-text("Something went wrong"):visible',
 connectorPicker:'button[aria-label*="tools" i]:visible, button[aria-label*="connector" i]:visible',
 connectorOption:'[role="menuitem"], [role="option"]',
 connectorSelected:'[data-testid*="connector"]:has-text("Queqiao"), [aria-label*="Queqiao"]'
};
export const claudeAdapter=createWebChatAdapter(claudeSite);
