import { describe, expect, it } from "vitest";
import { presetShareLabel } from "../src/services/beast/helpers";

describe("presetShareLabel", () => {
  it("shows percent of beasts", () => {
    expect(presetShareLabel(250, 1000)).toBe("25.0% of beasts");
    expect(presetShareLabel(3, 1000)).toBe("0.30% of beasts");
  });
  it("handles empty counts", () => {
    expect(presetShareLabel(0, 1000)).toBe("None collected yet");
    expect(presetShareLabel(5, 0)).toBe("None collected yet");
  });
});
