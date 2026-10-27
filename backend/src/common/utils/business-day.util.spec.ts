import { describe, expect, it } from "@jest/globals";
import { startOfBusinessDay } from "./business-day.util.js";

describe("startOfBusinessDay", () => {
  it("returns Bogota midnight for a morning instant", () => {
    expect(
      startOfBusinessDay(new Date("2026-10-26T14:30:00.000Z")).toISOString(),
    ).toBe("2026-10-26T05:00:00.000Z");
  });

  it("keeps the previous Bogota day before 05:00 UTC", () => {
    expect(
      startOfBusinessDay(new Date("2026-10-27T03:00:00.000Z")).toISOString(),
    ).toBe("2026-10-26T05:00:00.000Z");
  });

  it("treats exact Bogota midnight as the start of the new day", () => {
    expect(
      startOfBusinessDay(new Date("2026-10-27T05:00:00.000Z")).toISOString(),
    ).toBe("2026-10-27T05:00:00.000Z");
  });
});
