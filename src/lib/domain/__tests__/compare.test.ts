import { describe, expect, it } from "vitest";
import {
  buildCompare,
  type CompareItemInput,
  type CompareQuoteInput,
} from "@/lib/domain/compare";

/** 필수·미선택 항목을 만들고 지정한 필드만 덮어쓴다. */
function item(
  itemCode: string | null,
  rawName: string,
  amount: number,
  overrides: Partial<Omit<CompareItemInput, "itemCode" | "rawName" | "amount">> = {},
): CompareItemInput {
  return { itemCode, rawName, amount, required: true, selected: false, ...overrides };
}

function quote(
  quoteId: string,
  guestCount: number,
  items: readonly CompareItemInput[],
  vendorName = `${quoteId} 업체`,
): CompareQuoteInput {
  return {
    quoteId,
    vendorName,
    quoteDate: new Date("2026-05-01T00:00:00.000Z"),
    guestCount,
    items,
  };
}

/**
 * 대표 시나리오: 구조가 다른 견적 2개.
 * A(200명): 대관 1,000,000 + 식사 200,000×2(동일 코드 합산 대상) + 할인 -100,000(선택)
 * B(0명):   대관 800,000 + 부케 300,000(A에 없음) + 미분류 "특별할인" -200,000(선택)
 * A 총액: min 1,400,000 / 옵션포함 1,300,000 / 1인당 floor(1,300,000/200) = 6,500
 * B 총액: min 1,100,000 / 옵션포함 900,000 / 1인당 null(guestCount 0)
 */
const quoteA = quote("quote-a", 200, [
  item("HALL_RENTAL", "대관", 1_000_000),
  item("MEAL", "식사", 200_000),
  item("MEAL", "식사(추가 테이블)", 200_000),
  item("DISCOUNT", "할인", -100_000, { required: false, selected: true }),
]);

const quoteB = quote("quote-b", 0, [
  item("HALL_RENTAL", "대관", 800_000),
  item("FLOWER", "부케", 300_000),
  item(null, "특별할인", -200_000, { required: false, selected: true }),
]);

describe("buildCompare 그룹핑", () => {
  it("itemCode별로 1행씩 만들고 ITEM_CODES 표준 순서로 배치한다", () => {
    const result = buildCompare([quoteA, quoteB]);

    expect(result.rows.map((row) => row.itemCode)).toEqual([
      "HALL_RENTAL",
      "MEAL",
      "FLOWER",
      "DISCOUNT",
      null, // 미분류 rawName 그룹은 코드 행 뒤에 온다
    ]);
    expect(result.rows[0].label).toBe("대관료"); // ITEM_CODE_LABELS
  });

  it("같은 견적 안의 동일 코드 여러 행을 합산한다", () => {
    const result = buildCompare([quoteA, quoteB]);
    const mealRow = result.rows.find((row) => row.itemCode === "MEAL");

    expect(mealRow?.perQuote).toEqual({ "quote-a": 400_000, "quote-b": null });
  });

  it("한 견적에만 있는 항목은 다른 견적에서 null이고, 견적 순서를 유지한다", () => {
    const result = buildCompare([quoteA, quoteB]);
    const flowerRow = result.rows.find((row) => row.itemCode === "FLOWER");

    expect(Object.keys(flowerRow?.perQuote ?? {})).toEqual(["quote-a", "quote-b"]);
    expect(flowerRow?.perQuote).toEqual({ "quote-a": null, "quote-b": 300_000 });
  });

  it("itemCode가 null인 항목은 rawName 완전일치끼리 '기타' 행으로 묶는다", () => {
    const result = buildCompare([quoteA, quoteB]);
    const etcRow = result.rows.find((row) => row.itemCode === null);

    expect(etcRow?.label).toBe("기타");
    expect(etcRow?.perQuote).toEqual({ "quote-a": null, "quote-b": -200_000 });
  });

  it("rawName 매칭은 완전일치만 한다(공백 하나로도 다른 그룹)", () => {
    const result = buildCompare([
      quote("q1", 100, [item(null, "특별할인", -100)]),
      quote("q2", 100, [item(null, "특별 할인", -200)]),
    ]);

    const etcRows = result.rows.filter((row) => row.itemCode === null);
    expect(etcRows).toHaveLength(2);
    expect(etcRows[0].perQuote).toEqual({ q1: -100, q2: null });
    expect(etcRows[1].perQuote).toEqual({ q1: null, q2: -200 });
  });

  it("DISCOUNT 코드는 특별 취급 없이 음수 금액의 자체 코드 행이 된다", () => {
    const result = buildCompare([quoteA, quoteB]);
    const discountRow = result.rows.find((row) => row.itemCode === "DISCOUNT");

    expect(discountRow?.label).toBe("할인");
    expect(discountRow?.perQuote).toEqual({ "quote-a": -100_000, "quote-b": null });
  });
});

describe("buildCompare 총액(totals 엔진 연동)", () => {
  it("견적별 총액을 손계산과 일치하게 계산하고 요약을 내보낸다", () => {
    const result = buildCompare([quoteA, quoteB]);

    expect(result.quotes[0]).toEqual({
      quoteId: "quote-a",
      vendorName: "quote-a 업체",
      quoteDate: "2026-05-01T00:00:00.000Z", // ISO 문자열
      guestCount: 200,
      minTotal: 1_400_000,
      withOptionsTotal: 1_300_000,
      perGuest: 6_500,
    });
    expect(result.quotes[1].minTotal).toBe(1_100_000);
    expect(result.quotes[1].withOptionsTotal).toBe(900_000);
  });

  it("guestCount가 0이면 perGuest는 null이다", () => {
    const result = buildCompare([quoteA, quoteB]);

    expect(result.quotes[1].guestCount).toBe(0);
    expect(result.quotes[1].perGuest).toBeNull();
  });

  it("항목이 없는 견적은 총액 0으로 정상 응답이고 행에 기여하지 않는다", () => {
    const result = buildCompare([
      quote("empty", 100, []),
      quote("q2", 100, [item("HALL_RENTAL", "대관", 500_000)]),
    ]);

    expect(result.rows).toEqual([
      {
        itemCode: "HALL_RENTAL",
        label: "대관료",
        perQuote: { empty: null, q2: 500_000 },
      },
    ]);
    expect(result.quotes[0].minTotal).toBe(0);
    expect(result.quotes[0].withOptionsTotal).toBe(0);
    expect(result.quotes[0].perGuest).toBe(0); // floor(0/100)
  });
});
