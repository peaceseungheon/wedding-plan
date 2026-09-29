import { describe, expect, it } from "vitest";
import {
  normalizeQuoteItemAmount,
  parseQuoteItemCreate,
  parseQuoteItemUpdate,
} from "@/lib/domain/quote-item";

describe("normalizeQuoteItemAmount", () => {
  it("forces a positive DISCOUNT price to a negative amount", () => {
    expect(normalizeQuoteItemAmount(1, 50000, "DISCOUNT")).toBe(-50000);
  });

  it("keeps an already-negative DISCOUNT price negative", () => {
    expect(normalizeQuoteItemAmount(1, -50000, "DISCOUNT")).toBe(-50000);
  });

  it("leaves non-DISCOUNT amounts untouched in both signs", () => {
    expect(normalizeQuoteItemAmount(1, 1500000, "HALL_RENTAL")).toBe(1500000);
    expect(normalizeQuoteItemAmount(1, -30000, "ETC")).toBe(-30000);
  });

  it("leaves a null itemCode (미분류) untouched", () => {
    expect(normalizeQuoteItemAmount(2, 10000, null)).toBe(20000);
  });

  it("applies the DISCOUNT sign after qty multiplication", () => {
    expect(normalizeQuoteItemAmount(2, 30000, "DISCOUNT")).toBe(-60000);
    expect(normalizeQuoteItemAmount(2, -30000, "DISCOUNT")).toBe(-60000);
  });

  it("stores 0, never −0, when a DISCOUNT item multiplies to zero", () => {
    expect(normalizeQuoteItemAmount(1, 0, "DISCOUNT")).toBe(0);
    expect(normalizeQuoteItemAmount(3, 0, "DISCOUNT")).toBe(0);
    expect(Object.is(normalizeQuoteItemAmount(1, 0, "DISCOUNT"), -0)).toBe(false);
  });
});

describe("parseQuoteItemCreate", () => {
  it("fills defaults for absent optional fields", () => {
    const parsed = parseQuoteItemCreate({ rawName: "대관", unitPrice: 1500000 });

    expect(parsed).toEqual({
      ok: true,
      value: {
        rawName: "대관",
        itemCode: null,
        qty: 1,
        unitPrice: 1500000,
        required: true,
        selected: false,
        sortOrder: undefined,
      },
    });
  });

  it("rejects a client-sent amount instead of trusting it", () => {
    const parsed = parseQuoteItemCreate({ rawName: "대관", unitPrice: 1, amount: 999 });

    expect(parsed).toEqual({ ok: false, error: "amount는 클라이언트가 지정할 수 없습니다(서버 계산)." });
  });

  it("rejects an itemCode outside ITEM_CODES", () => {
    const parsed = parseQuoteItemCreate({ rawName: "대관", itemCode: "BOGUS", unitPrice: 1 });

    expect(parsed.ok).toBe(false);
  });

  it("rejects qty below 1 and missing required fields", () => {
    expect(parseQuoteItemCreate({ rawName: "대관", unitPrice: 1, qty: 0 }).ok).toBe(false);
    expect(parseQuoteItemCreate({ unitPrice: 1 }).ok).toBe(false);
    expect(parseQuoteItemCreate({ rawName: "대관" }).ok).toBe(false);
    expect(parseQuoteItemCreate({ rawName: "  ", unitPrice: 1 }).ok).toBe(false);
  });
});

describe("parseQuoteItemUpdate", () => {
  it("keeps the 3-state itemCode convention: absent=unchanged, null=미분류", () => {
    const absent = parseQuoteItemUpdate({ qty: 2 });
    const cleared = parseQuoteItemUpdate({ itemCode: null });

    expect(absent).toEqual({ ok: true, value: { qty: 2 } });
    expect(cleared).toEqual({ ok: true, value: { itemCode: null } });
  });

  it("rejects an empty body and a client-sent amount", () => {
    expect(parseQuoteItemUpdate({}).ok).toBe(false);
    expect(parseQuoteItemUpdate({ qty: 2, amount: 1 }).ok).toBe(false);
  });
});
