import { createWebChatAdapter, type WebChatSite } from "./web-chat.js";
export const grokSite:WebChatSite = {
 id:"grok",origin:"https://grok.com",bootstrapUrl:"https://grok.com/",newChatUrl:"https://grok.com/",
 conversationPaths:["chat","c"],editor:'[contenteditable="true"][role="textbox"]:visible, textarea:visible',
 send:'button[aria-label*="Send" i]:visible, button[type="submit"]:visible',
 assistant:'[data-role="assistant"], [data-message-author-role="assistant"], [data-testid="assistant-message"]',
 stop:'button[aria-label*="Stop" i]:visible, button[data-testid="stop-button"]:visible',
 login:'a[href*="/login"]:visible, button:has-text("Sign in"):visible',
 loading:'[role="progressbar"]:visible, [aria-busy="true"]:visible',
 loadError:'[role="alert"]:has-text("error"):visible, [role="alert"]:has-text("failed"):visible',
 connectorPicker:'button[aria-label*="tools" i]:visible, button[aria-label*="connector" i]:visible',
 connectorOption:'[role="menuitem"], [role="option"]',
 connectorSelected:'[data-testid*="connector"]:has-text("Queqiao"), [aria-label*="Queqiao"]'
};
export const grokAdapter=createWebChatAdapter(grokSite);
