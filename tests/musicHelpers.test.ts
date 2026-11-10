import { describe, it, expect, vi } from "vitest";
import { parseTrackRef, trackRefOf, withRetry } from "../src/services/beast/music";

describe("parseTrackRef", () => {
  it("round-trips with trackRefOf", () => {
    for (const ref of ["shared:0", "shared:1", "named", "individual:12"]) {
      expect(trackRefOf(parseTrackRef(ref))).toBe(ref);
    }
    expect(parseTrackRef("bogus")).toBeNull();
  });
});

describe("withRetry", () => {
  it("retries server errors, then succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(Object.assign(new Error("500"), { status: 500 })).mockResolvedValue("ok");
    const p = withRetry(fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry client errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("404"), { status: 404 }));
    await expect(withRetry(fn)).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
