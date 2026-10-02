import { describe, expect, it } from "vitest";
import {
  formatKRW,
  formatManwon,
  minTotal,
  perGuest,
  withOptionsTotal,
  type QuoteItemInput,
} from "@/lib/domain/totals";

/** 비필수·미선택 100,000원 기본 항목을 만들고 지정한 필드만 덮어쓴다. */
function item(overrides: Partial<QuoteItemInput> = {}): QuoteItemInput {
  return { amount: 100_000, required: false, selected: false, itemCode: null, ...overrides };
}

describe("minTotal", () => {
  it("sums only required items", () => {
    const items = [
      item({ amount: 100_000, required: true }),
      item({ amount: 50_000, selected: true }), // 비필수 옵션은 제외
    ];

    expect(minTotal(items)).toBe(100_000);
  });
});

describe("withOptionsTotal", () => {
  it("includes required and selected items and excludes unselected options", () => {
    const items = [
      item({ amount: 100_000, required: true, selected: false }),
      item({ amount: 50_000, selected: true }),
      item({ amount: 30_000 }), // 미선택 옵션 → 제외
    ];

    expect(withOptionsTotal(items)).toBe(150_000);
  });

  it("subtracts a selected DISCOUNT and ignores it when unselected", () => {
    // DISCOUNT는 itemCode일 뿐, 엔진은 부호를 특별 취급하지 않는다.
    // 항목 생성 시점에 음수로 정규화되어 들어온다.
    expect(
      withOptionsTotal([
        item({ amount: 1_000_000, required: true }),
        item({ amount: -200_000, itemCode: "DISCOUNT", selected: true }),
      ]),
    ).toBe(800_000); // 1,000,000 − 200,000

    // 미선택 할인은 차감되지 않는다.
    expect(
      withOptionsTotal([
        item({ amount: 1_000_000, required: true }),
        item({ amount: -200_000, itemCode: "DISCOUNT" }),
      ]),
    ).toBe(1_000_000);
  });

  it("adds VAT as a plain amount with no special casing", () => {
    expect(
      withOptionsTotal([
        item({ amount: 1_000_000, required: true }),
        item({ amount: 100_000, itemCode: "VAT", selected: true }),
      ]),
    ).toBe(1_100_000);
  });
});

describe("perGuest", () => {
  it("floors the per-guest division", () => {
    const items = [item({ amount: 1_000_000, required: true })];

    expect(perGuest(items, 3)).toBe(333_333); // 1,000,000 / 3 = 333,333.33… → 버림
  });

  it("floors negative totals toward -∞", () => {
    const items = [item({ amount: -1_000, itemCode: "DISCOUNT", selected: true })];

    expect(perGuest(items, 3)).toBe(-334); // -1,000 / 3 = -333.33… → -334
  });

  it("returns null when guestCount is 0", () => {
    expect(perGuest([item({ required: true })], 0)).toBeNull();
  });
});

describe("empty list", () => {
  it("yields 0 totals and follows the guestCount rule for perGuest", () => {
    expect(minTotal([])).toBe(0);
    expect(withOptionsTotal([])).toBe(0);
    expect(perGuest([], 10)).toBe(0);
    expect(perGuest([], 0)).toBeNull();
  });
});

describe("formatKRW", () => {
  it("formats with thousands commas and the 원 suffix", () => {
    expect(formatKRW(1_234_567)).toBe("1,234,567원");
  });

  it("prefixes the minus sign for negative amounts", () => {
    expect(formatKRW(-200_000)).toBe("-200,000원");
  });
});

describe("대표 시나리오: 필수 4 + 옵션 2(1개 선택) + 할인 1 + VAT 1", () => {
  // 필수 4: 대관 2,000,000 + 식대 1,000,000 + 꽃 500,000(필수지만 미선택) + 예식+스냅 1,500,000
  //   minTotal = 2,000,000 + 1,000,000 + 500,000 + 1,500,000 = 5,000,000
  // 옵션: 드레스 업그레이드 300,000(선택) / 헬퍼 200,000(미선택 → 제외)
  // 할인 -200,000(선택 → 차감), VAT +500,000(선택 → 가산)
  // withOptionsTotal = 5,000,000 + 300,000 - 200,000 + 500,000 = 5,600,000
  // perGuest(300명) = floor(5,600,000 / 300) = floor(18,666.66…) = 18,666
  const items: QuoteItemInput[] = [
    item({ amount: 2_000_000, required: true, selected: true, itemCode: "HALL_RENTAL" }),
    item({ amount: 1_000_000, required: true, selected: true, itemCode: "MEAL" }),
    item({ amount: 500_000, required: true, selected: false, itemCode: "FLOWER" }),
    item({ amount: 1_500_000, required: true, selected: true, itemCode: "CEREMONY_PHOTO" }),
    item({ amount: 300_000, itemCode: "DRESS_UPGRADE", selected: true }),
    item({ amount: 200_000, itemCode: "HELPER" }),
    item({ amount: -200_000, itemCode: "DISCOUNT", selected: true }),
    item({ amount: 500_000, itemCode: "VAT", selected: true }),
  ];

  it("minTotal counts only the four required items", () => {
    expect(minTotal(items)).toBe(5_000_000);
  });

  it("withOptionsTotal excludes the unselected helper and applies discount and VAT", () => {
    expect(withOptionsTotal(items)).toBe(5_600_000);
  });

  it("perGuest for 300 guests floors to 18,666", () => {
    expect(perGuest(items, 300)).toBe(18_666);
  });

  it("formats the total in KRW", () => {
    expect(formatKRW(withOptionsTotal(items))).toBe("5,600,000원");
  });
});

describe("formatManwon", () => {
  it("formats whole 만원 amounts without decimals", () => {
    expect(formatManwon(12_400_000)).toBe("1,240만원");
    expect(formatManwon(10_000)).toBe("1만원");
  });

  it("keeps one decimal place of 만원", () => {
    expect(formatManwon(78_000)).toBe("7.8만원");
    expect(formatManwon(12_345_678)).toBe("1,234.6만원");
  });

  it("rounds up into the next whole 만원", () => {
    expect(formatManwon(99_999)).toBe("10만원");
  });

  it("falls back to 원 below 1만원", () => {
    expect(formatManwon(9_999)).toBe("9,999원");
    expect(formatManwon(0)).toBe("0원");
  });

  it("keeps the sign for negative amounts", () => {
    expect(formatManwon(-3_200_000)).toBe("-320만원");
  });
});
