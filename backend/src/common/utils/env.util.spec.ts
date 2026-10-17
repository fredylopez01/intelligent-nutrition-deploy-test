import { describe, expect, it } from "@jest/globals";
import { positiveIntFromEnv } from "./env.util.js";

describe("positiveIntFromEnv", () => {
  it("reads a positive whole number", () => {
    expect(positiveIntFromEnv("5", 10)).toBe(5);
    expect(positiveIntFromEnv("300", 60)).toBe(300);
  });

  it("falls back when the variable is missing or empty", () => {
    expect(positiveIntFromEnv(undefined, 5)).toBe(5);
    expect(positiveIntFromEnv("", 5)).toBe(5);
    expect(positiveIntFromEnv("   ", 300)).toBe(300);
  });

  it("falls back when the value is zero, negative, decimal or not a number", () => {
    expect(positiveIntFromEnv("0", 5)).toBe(5);
    expect(positiveIntFromEnv("-2", 5)).toBe(5);
    expect(positiveIntFromEnv("2.5", 5)).toBe(5);
    expect(positiveIntFromEnv("five", 5)).toBe(5);
  });
});
