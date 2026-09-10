import { describe, expect, it } from "vitest";
import { resolveGenericUrl } from "./generic.js";

describe("resolveGenericUrl", () => {
  it("prefers action args and falls back to adapter config", () => {
    expect(resolveGenericUrl({ url: "https://a.test" }, { url: "https://b.test" })).toBe("https://a.test");
    expect(resolveGenericUrl({}, { url: "https://b.test" })).toBe("https://b.test");
  });
  it("rejects non-http targets", () => {
    expect(() => resolveGenericUrl({}, { url: "file:///tmp/a" })).toThrow(/http/);
  });
});
