import { createWebChatAdapter, type WebChatSite } from "./web-chat.js";
export const mistralSite:WebChatSite = {
 id:"mistral",origin:"https://chat.mistral.ai",bootstrapUrl:"https://chat.mistral.ai/chat",newChatUrl:"https://chat.mistral.ai/chat",
 conversationPaths:["chat"],editor:'textarea[placeholder]:visible, [contenteditable="true"][role="textbox"]:visible',
 send:'button[type="submit"]:visible, button[aria-label*="Send" i]:visible',
 assistant:'[data-testid="assistant-message"], [data-role="assistant"], [data-message-role="assistant"]',
 stop:'button[aria-label*="Stop" i]:visible, button[data-testid="stop-generation"]:visible',
 login:'a[href*="login"]:visible, button:has-text("Sign in"):visible',
 loading:'[role="progressbar"]:visible, [aria-busy="true"]:visible',
 loadError:'[role="alert"]:has-text("error"):visible, [role="alert"]:has-text("failed"):visible',
 connectorPicker:'button[aria-label*="tools" i]:visible, button[aria-label*="connector" i]:visible',
 connectorOption:'[role="menuitem"], [role="option"]',
 connectorSelected:'[data-testid*="connector"]:has-text("Queqiao"), [aria-label*="Queqiao"]'
};
export const mistralAdapter=createWebChatAdapter(mistralSite);
