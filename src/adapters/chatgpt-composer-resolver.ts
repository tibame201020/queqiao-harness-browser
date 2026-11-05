import type { Page } from "playwright-core";
import { resolveSemanticEditor, type SemanticEditorResolution } from "../core/semantic-editor.js";

export const CHATGPT_COMPOSER_CSS =
  '#prompt-textarea:visible, [role="textbox"][contenteditable="true"]:visible';
export const CHATGPT_FORM_SEND_CSS = '[data-testid="send-button"], button[type="submit"]';

export type ComposerResolution = Omit<SemanticEditorResolution, "editor"> & { composer: SemanticEditorResolution["editor"] };

/** ChatGPT-specific contract, backed by the shared browser Accessibility resolver. */
export async function resolveChatGptComposer(page: Page): Promise<ComposerResolution> {
  const {editor, ...rest} = await resolveSemanticEditor(page, {
    css:CHATGPT_COMPOSER_CSS,roles:["textbox"],sendWithinForm:CHATGPT_FORM_SEND_CSS,
  });
  return {...rest,composer:editor};
}
