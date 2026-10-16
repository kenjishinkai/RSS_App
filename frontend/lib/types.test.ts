import { describe, expect, it } from "vitest";
import { toImportanceLevel } from "@/lib/types";

describe("toImportanceLevel", () => {
  it("maps high and 高", () => {
    expect(toImportanceLevel("high")).toBe("high");
    expect(toImportanceLevel("高")).toBe("high");
  });

  it("maps medium, mid, and 中", () => {
    expect(toImportanceLevel("medium")).toBe("medium");
    expect(toImportanceLevel("mid")).toBe("medium");
    expect(toImportanceLevel("中")).toBe("medium");
  });

  it("falls back to low for unknown or empty", () => {
    expect(toImportanceLevel("low")).toBe("low");
    expect(toImportanceLevel("unknown")).toBe("low");
    expect(toImportanceLevel(null)).toBe("low");
    expect(toImportanceLevel(undefined)).toBe("low");
    expect(toImportanceLevel("  ")).toBe("low");
  });
});
