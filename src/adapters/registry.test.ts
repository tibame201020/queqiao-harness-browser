import { describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "./registry.js";

describe("AdapterRegistry", () => {
  it("keeps site behavior behind an adapter boundary", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const registry = new AdapterRegistry([{ id: "fake", bootstrapUrl: "https://example.test", execute }]);
    await registry.execute("fake", "open", { x: 1 }, {} as never);
    expect(execute).toHaveBeenCalledWith("open", { x: 1 }, expect.anything());
  });

  it("lets adapters validate and normalize their own config at init time", () => {
    const validateConfig = vi.fn().mockReturnValue({ normalized: true });
    const registry = new AdapterRegistry([{ id: "fake", bootstrapUrl: "https://example.test", validateConfig, async execute() { return {}; } }]);
    expect(registry.validateConfig("fake", { raw: true })).toEqual({ normalized: true });
    expect(validateConfig).toHaveBeenCalledWith({ raw: true });
  });

  it("rejects unknown adapters", async () => {
    const registry = new AdapterRegistry([]);
    await expect(registry.execute("missing", "open", {}, {} as never)).rejects.toThrow(/Unknown adapter/);
  });
});
