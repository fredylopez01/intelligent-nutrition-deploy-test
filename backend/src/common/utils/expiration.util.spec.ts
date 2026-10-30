import { describe, expect, it } from "@jest/globals";
import {
  formatExpirationDate,
  isExpired,
  startOfTodayUtc,
  toExpirationDate,
} from "./expiration.util.js";

const now = new Date("2026-10-25T18:30:00.000Z");

describe("expiration utils", () => {
  it("normalizes dates to midnight UTC", () => {
    expect(toExpirationDate("2026-12-31")).toEqual(
      new Date("2026-12-31T00:00:00.000Z"),
    );
    expect(toExpirationDate("2026-12-31T00:00:00Z")).toEqual(
      new Date("2026-12-31T00:00:00.000Z"),
    );
    expect(startOfTodayUtc(now)).toEqual(new Date("2026-10-25T00:00:00.000Z"));
  });

  it("treats a lot as sellable until the end of its expiration day", () => {
    expect(isExpired(toExpirationDate("2026-10-24"), now)).toBe(true);
    expect(isExpired(toExpirationDate("2026-10-25"), now)).toBe(false);
    expect(isExpired(toExpirationDate("2026-10-26"), now)).toBe(false);
  });

  it("formats the expiration date as YYYY-MM-DD", () => {
    expect(formatExpirationDate(new Date("2027-01-20T00:00:00.000Z"))).toBe(
      "2027-01-20",
    );
  });
});
