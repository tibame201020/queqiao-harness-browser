import { AdapterRegistry } from "./registry.js";
import type { HarnessAdapter } from "./types.js";
import { genericAdapter } from "./generic.js";
import { chatgptAdapter } from "./chatgpt-adapter.js";
import { claudeAdapter } from "./claude-adapter.js";
import { mistralAdapter } from "./mistral-adapter.js";
import { grokAdapter } from "./grok-adapter.js";

// One registry for the Worker runner and its contract tests.
// Site-specific capabilities remain on each concrete HarnessAdapter.
export const builtinAdapters = [genericAdapter, chatgptAdapter, claudeAdapter, mistralAdapter, grokAdapter] as const satisfies readonly HarnessAdapter[];
export function createBuiltInRegistry(): AdapterRegistry {
  return new AdapterRegistry(builtinAdapters);
}