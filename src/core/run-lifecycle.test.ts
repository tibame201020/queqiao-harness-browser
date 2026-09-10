import { describe, expect, it, vi } from "vitest";
import { executeRunLifecycle } from "./run-lifecycle.js";

describe("executeRunLifecycle", () => {
  it("marks ERROR when opening the browser session fails", async () => {
    const markRunning = vi.fn().mockResolvedValue(undefined);
    const markError = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    await expect(executeRunLifecycle({
      markRunning,
      open: vi.fn().mockRejectedValue(new Error("profile busy")),
      execute: vi.fn(),
      markSuccess: vi.fn(),
      markError,
      close,
    })).rejects.toThrow("profile busy");
    expect(markRunning).toHaveBeenCalledOnce();
    expect(markError).toHaveBeenCalledWith(expect.any(Error));
    expect(close).not.toHaveBeenCalled();
  });

  it("closes an opened session after success", async () => {
    const session = { id: 1 };
    const close = vi.fn().mockResolvedValue(undefined);
    const markSuccess = vi.fn().mockResolvedValue(undefined);
    await expect(executeRunLifecycle({
      markRunning: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(session),
      execute: vi.fn().mockResolvedValue("ok"),
      markSuccess,
      markError: vi.fn(),
      close,
    })).resolves.toBe("ok");
    expect(markSuccess).toHaveBeenCalledWith("ok");
    expect(close).toHaveBeenCalledWith(session);
  });
});
