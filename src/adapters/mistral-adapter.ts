import { createWebChatAdapter, type WebChatSite } from "./web-chat.js";
export const mistralSite:WebChatSite = {
 id:"mistral",origin:"https://chat.mistral.ai",bootstrapUrl:"https://chat.mistral.ai/work",newChatUrl:"https://chat.mistral.ai/work",
 conversationPaths:["work"],editor:'form [contenteditable="true"].ProseMirror:visible',
 send:'form button[aria-label="Send"][type="submit"]:visible',
 assistant:'[data-message-part-type="answer"][data-testid="text-message-part"]',
 stop:'form button[aria-label*="Stop" i]:visible, form button[aria-label*="Cancel" i]:visible',
 working:'[data-testid="harness-steps-summary"]:has-text("Working"), [data-testid="harness-steps-summary"]:has-text("Thinking")',
 login:'a[href*="login"]:visible, button:has-text("Sign in"):visible',
 loading:'[role="progressbar"]:visible, [aria-busy="true"]:visible',
 loadError:'[role="alert"]:has-text("error"):visible, [role="alert"]:has-text("failed"):visible',
 connectorPicker:'form button[aria-label="Open settings menu"]:visible',
 connectorOption:'[role="menuitem"], [role="option"]',
 connectorSelected:'[data-testid*="connector"]:has-text("Queqiao"), [aria-label*="Queqiao"]'
};
export const mistralAdapter=createWebChatAdapter(mistralSite);
