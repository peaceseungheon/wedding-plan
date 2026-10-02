import { describe, expect, it } from "vitest";
import { benchmarkTone, budgetTone, lowestQuoteIds } from "@/lib/domain/tone";

describe("budgetTone", () => {
  it("is neutral when there is no planned budget", () => {
    expect(budgetTone(1_000_000, 0)).toBe("neutral");
  });

  it("is positive below 90% of the plan", () => {
    expect(budgetTone(0, 1_000_000)).toBe("positive");
    expect(budgetTone(899_999, 1_000_000)).toBe("positive");
  });

  it("is caution from 90% up to exactly 100%", () => {
    expect(budgetTone(900_000, 1_000_000)).toBe("caution");
    expect(budgetTone(1_000_000, 1_000_000)).toBe("caution");
  });

  it("is negative above 100%", () => {
    expect(budgetTone(1_000_001, 1_000_000)).toBe("negative");
  });
});

describe("benchmarkTone", () => {
  it("is positive at or below the regional average", () => {
    expect(benchmarkTone(-8)).toBe("positive");
    expect(benchmarkTone(0)).toBe("positive");
  });

  it("is caution up to +20%", () => {
    expect(benchmarkTone(0.1)).toBe("caution");
    expect(benchmarkTone(20)).toBe("caution");
  });

  it("is negative above +20%", () => {
    expect(benchmarkTone(20.1)).toBe("negative");
  });
});

describe("lowestQuoteIds", () => {
  it("returns the quote with the lowest amount", () => {
    expect(lowestQuoteIds({ a: 300, b: 0, c: 550 })).toEqual(["b"]);
  });

  it("returns every quote tied for the lowest amount", () => {
    expect(lowestQuoteIds({ a: 100, b: 100, c: 200 })).toEqual(["a", "b"]);
  });

  it("ignores quotes without the item", () => {
    expect(lowestQuoteIds({ a: null, b: 200, c: 150 })).toEqual(["c"]);
  });

  it("returns nothing when fewer than two quotes have the item", () => {
    expect(lowestQuoteIds({ a: null, b: 200 })).toEqual([]);
  });

  it("returns nothing when every amount is equal", () => {
    expect(lowestQuoteIds({ a: 100, b: 100 })).toEqual([]);
  });
});
