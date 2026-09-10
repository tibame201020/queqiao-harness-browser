import type { AdapterExecutionContext, HarnessAdapter } from "./types.js";

export class AdapterRegistry {
  readonly #adapters = new Map<string, HarnessAdapter>();
  constructor(adapters: readonly HarnessAdapter[]) {
    for (const adapter of adapters) this.#adapters.set(adapter.id, adapter);
  }
  get(id: string): HarnessAdapter {
    const adapter = this.#adapters.get(id);
    if (!adapter) throw new Error(`Unknown adapter: ${id}`);
    return adapter;
  }
  validateConfig(id: string, config: unknown): unknown {
    const adapter = this.get(id);
    return adapter.validateConfig ? adapter.validateConfig(config) : config;
  }
  async execute(id: string, action: string, args: Record<string, unknown>, context: AdapterExecutionContext): Promise<unknown> {
    return this.get(id).execute(action, args, context);
  }
}
