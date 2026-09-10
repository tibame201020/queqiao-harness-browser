export type AdapterExecutionContext = {
  profileName?: string;
  browser?: unknown;
  config?: unknown;
};

export interface HarnessAdapter {
  id: string;
  bootstrapUrl: string;
  validateConfig?(config: unknown): unknown;
  execute(action: string, args: Record<string, unknown>, context: AdapterExecutionContext): Promise<unknown>;
}
