import { createWebChatAdapter, type WebChatSite } from "./web-chat.js";
export const grokSite:WebChatSite = {
 id:"grok",origin:"https://grok.com",bootstrapUrl:"https://grok.com/",newChatUrl:"https://grok.com/",
 conversationPaths:["c"],editor:'form[data-composer="true"] [contenteditable="true"][role="combobox"]:visible, form[data-composer="true"] [contenteditable="true"][role="textbox"]:visible',
 send:'form[data-composer="true"] button[data-testid="chat-submit"][type="submit"]:visible',
 assistant:'[data-testid="assistant-message"]',
 stop:'button[aria-label*="Stop" i]:visible, button[aria-label*="停止"]:visible, button[data-testid*="stop"]:visible',
 login:'a[href*="/login"]:visible, button:has-text("Sign in"):visible',
 loading:'[role="progressbar"]:visible, [aria-busy="true"]:visible',
 loadError:'[role="alert"]:has-text("error"):visible, [role="alert"]:has-text("failed"):visible',
 connectorPicker:'button[data-testid="attach-button"]:visible, button:has-text("插件"):visible',
 connectorOption:'[role="menuitem"], [role="option"]',
 connectorSelected:'[data-testid*="connector"]:has-text("Queqiao"), [aria-label*="Queqiao"]'
};
export const grokAdapter=createWebChatAdapter(grokSite);
