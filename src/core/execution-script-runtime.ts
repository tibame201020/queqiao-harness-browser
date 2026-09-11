import { compileExecutionScript, ExecutionScriptError, type CompiledExecutionScript } from "./execution-script.js";

export type ExecutionScriptRuntime = {
  save(config: CompiledExecutionScript["config"]): Promise<void>;
  run(executionId: string, action: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  start(executionId: string): Promise<Record<string, unknown>>;
  stop(executionId: string): Promise<Record<string, unknown>>;
};

export async function executeExecutionScript(input: unknown, runtime: ExecutionScriptRuntime): Promise<Record<string, unknown>> {
  let compiled: CompiledExecutionScript;
  try {
    compiled = compileExecutionScript(input);
  } catch (error) {
    if (error instanceof ExecutionScriptError) {
      return { status: "rejected", code: error.code, issues: error.issues };
    }
    throw error;
  }

  if (compiled.mode === "once") {
    await runtime.save(compiled.config);
    const result = await runtime.run(compiled.executionId, compiled.action, compiled.args);
    return { ...result, executionId: compiled.executionId, mode: "once" };
  }

  await runtime.stop(compiled.executionId);
  await runtime.save(compiled.config);
  const result = await runtime.start(compiled.executionId);
  return { ...result, executionId: compiled.executionId, mode: "interval" };
}
