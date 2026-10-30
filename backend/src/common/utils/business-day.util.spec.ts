import { describe, expect, it } from "@jest/globals";
import {
  businessDate,
  businessDayBounds,
  startOfBusinessDay,
} from "./business-day.util.js";

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

describe("businessDate", () => {
  it("returns the Bogota calendar date as a UTC midnight date", () => {
    expect(
      businessDate(new Date("2026-10-27T03:30:00.000Z")).toISOString(),
    ).toBe("2026-10-26T00:00:00.000Z");
  });

  it("moves to the next date at Bogota midnight", () => {
    expect(
      businessDate(new Date("2026-10-27T05:00:00.000Z")).toISOString(),
    ).toBe("2026-10-27T00:00:00.000Z");
  });
});

describe("businessDayBounds", () => {
  it("covers the whole Bogota day in UTC instants", () => {
    const { start, end } = businessDayBounds("2026-10-26");

    expect(start.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-27T04:59:59.999Z");
  });
});
