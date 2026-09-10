export type RunLifecycleOptions<TSession, TResult> = {
  markRunning(): Promise<unknown>;
  open(): Promise<TSession>;
  execute(session: TSession): Promise<TResult>;
  markSuccess(result: TResult): Promise<unknown>;
  markError(error: unknown): Promise<unknown>;
  close(session: TSession): Promise<unknown>;
};

export async function executeRunLifecycle<TSession, TResult>(options: RunLifecycleOptions<TSession, TResult>): Promise<TResult> {
  await options.markRunning();
  let session: TSession | undefined;
  let failed = false;
  try {
    session = await options.open();
    const result = await options.execute(session);
    await options.markSuccess(result);
    return result;
  } catch (error) {
    failed = true;
    await options.markError(error);
    throw error;
  } finally {
    if (session !== undefined) {
      try {
        await options.close(session);
      } catch (error) {
        if (!failed) {
          await options.markError(error);
          throw error;
        }
      }
    }
  }
}
