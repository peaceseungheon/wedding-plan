/**
 * 견적 항목(quote_items) 경계 파싱과 금액 정규화. 도메인 계층 규칙(typescript.md)에 따라
 * Prisma·Next.js를 임포트하지 않는 순수 함수만 둔다.
 */
import { ITEM_CODES, type ItemCode } from "@/lib/constants/item-codes";

/**
 * 견적 항목 저장 금액 규칙(PRD 7장). amount는 항상 qty × unitPrice이며 서버가
 * 유일한 계산자다(클라이언트가 보낸 amount는 경계에서 400으로 거절).
 * DISCOUNT 항목만 예외로 저장 부호를 음수로 강제한다: ±x → −x.
 * 입력 부호와 무관하게 abs를 취해 음수로 정착시키는 이유는 수동 입력(unitPrice
 * 음수 허용)과의 조합에서 부호가 뒤섞이는 것을 막기 위해서다.
 * DISCOUNT의 곱이 0이면 −0이 저장되지 않도록 0으로 정규화한다.
 */
export function normalizeQuoteItemAmount(
  qty: number,
  unitPrice: number,
  itemCode: string | null,
): number {
  const amount = qty * unitPrice;
  if (itemCode !== "DISCOUNT") return amount;
  if (amount === 0) return 0;
  return -Math.abs(amount);
}

function isItemCode(raw: string): raw is ItemCode {
  return ITEM_CODES.some((code) => code === raw);
}

type FieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function parseRawNameField(raw: unknown): FieldResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "rawName은 비어 있지 않은 문자열이어야 합니다." };
  }
  return { ok: true, value: raw };
}

/** null = 미분류. 그 외에는 ITEM_CODES 17개 코드 중 하나만 허용한다. */
function parseItemCodeField(raw: unknown): FieldResult<ItemCode | null> {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string" || !isItemCode(raw)) {
    return { ok: false, error: "itemCode는 표준 항목 코드 또는 null이어야 합니다." };
  }
  return { ok: true, value: raw };
}

function parseQtyField(raw: unknown): FieldResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, error: "qty는 1 이상의 정수여야 합니다." };
  }
  return { ok: true, value: raw };
}

/** 수동 입력 항목은 음수 unitPrice를 허용한다(할인 등을 임의로 표현). */
function parseUnitPriceField(raw: unknown): FieldResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { ok: false, error: "unitPrice는 정수여야 합니다." };
  }
  return { ok: true, value: raw };
}

function parseBooleanField(name: string, raw: unknown): FieldResult<boolean> {
  if (typeof raw !== "boolean") {
    return { ok: false, error: `${name}은 불리언이어야 합니다.` };
  }
  return { ok: true, value: raw };
}

function parseSortOrderField(raw: unknown): FieldResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { ok: false, error: "sortOrder는 정수여야 합니다." };
  }
  return { ok: true, value: raw };
}

/** amount는 서버 계산 필드다. 클라이언트가 보내면 거절한다(무시하지 않음). */
function rejectClientAmount(raw: object): string | null {
  return "amount" in raw ? "amount는 클라이언트가 지정할 수 없습니다(서버 계산)." : null;
}

export type QuoteItemCreateInput = {
  readonly rawName: string;
  readonly itemCode: ItemCode | null;
  readonly qty: number;
  readonly unitPrice: number;
  readonly required: boolean;
  readonly selected: boolean;
  readonly sortOrder?: number;
};

export type QuoteItemParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * POST 본문 파싱. rawName·unitPrice 필수, qty(1)·required(true)·selected(false)·
 * itemCode(null=미분류)는 기본값, sortOrder는 생략 시 라우트가 최댓값+1로 채운다.
 */
export function parseQuoteItemCreate(raw: unknown): QuoteItemParseResult<QuoteItemCreateInput> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "잘못된 JSON 본문입니다." };
  }
  const amountError = rejectClientAmount(raw);
  if (amountError !== null) return { ok: false, error: amountError };

  if (!("rawName" in raw)) return { ok: false, error: "rawName은 필수입니다." };
  const rawName = parseRawNameField(raw.rawName);
  if (!rawName.ok) return rawName;

  const itemCode =
    "itemCode" in raw ? parseItemCodeField(raw.itemCode) : ({ ok: true, value: null } as const);
  if (!itemCode.ok) return itemCode;

  const qty = "qty" in raw ? parseQtyField(raw.qty) : ({ ok: true, value: 1 } as const);
  if (!qty.ok) return qty;

  if (!("unitPrice" in raw)) return { ok: false, error: "unitPrice는 필수입니다." };
  const unitPrice = parseUnitPriceField(raw.unitPrice);
  if (!unitPrice.ok) return unitPrice;

  const required =
    "required" in raw ? parseBooleanField("required", raw.required) : ({ ok: true, value: true } as const);
  if (!required.ok) return required;

  const selected =
    "selected" in raw ? parseBooleanField("selected", raw.selected) : ({ ok: true, value: false } as const);
  if (!selected.ok) return selected;

  const sortOrder =
    "sortOrder" in raw ? parseSortOrderField(raw.sortOrder) : ({ ok: true, value: undefined } as const);
  if (!sortOrder.ok) return sortOrder;

  return {
    ok: true,
    value: {
      rawName: rawName.value,
      itemCode: itemCode.value,
      qty: qty.value,
      unitPrice: unitPrice.value,
      required: required.value,
      selected: selected.value,
      sortOrder: sortOrder.value,
    },
  };
}

export type QuoteItemUpdateInput = {
  readonly rawName?: string;
  readonly itemCode?: ItemCode | null;
  readonly qty?: number;
  readonly unitPrice?: number;
  readonly required?: boolean;
  readonly selected?: boolean;
  readonly sortOrder?: number;
};

/**
 * PUT 부분 갱신 파싱. 3상태 관습: 키 없음=변경 없음, itemCode null=미분류 초기화,
 * 값=치환. 알려진 필드가 하나도 없으면 400 사유를 돌려준다.
 */
export function parseQuoteItemUpdate(raw: unknown): QuoteItemParseResult<QuoteItemUpdateInput> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "수정할 필드를 하나 이상 입력하세요." };
  }
  const amountError = rejectClientAmount(raw);
  if (amountError !== null) return { ok: false, error: amountError };

  const data: {
    rawName?: string;
    itemCode?: ItemCode | null;
    qty?: number;
    unitPrice?: number;
    required?: boolean;
    selected?: boolean;
    sortOrder?: number;
  } = {};

  if ("rawName" in raw) {
    const field = parseRawNameField(raw.rawName);
    if (!field.ok) return field;
    data.rawName = field.value;
  }
  if ("itemCode" in raw) {
    const field = parseItemCodeField(raw.itemCode);
    if (!field.ok) return field;
    data.itemCode = field.value;
  }
  if ("qty" in raw) {
    const field = parseQtyField(raw.qty);
    if (!field.ok) return field;
    data.qty = field.value;
  }
  if ("unitPrice" in raw) {
    const field = parseUnitPriceField(raw.unitPrice);
    if (!field.ok) return field;
    data.unitPrice = field.value;
  }
  if ("required" in raw) {
    const field = parseBooleanField("required", raw.required);
    if (!field.ok) return field;
    data.required = field.value;
  }
  if ("selected" in raw) {
    const field = parseBooleanField("selected", raw.selected);
    if (!field.ok) return field;
    data.selected = field.value;
  }
  if ("sortOrder" in raw) {
    const field = parseSortOrderField(raw.sortOrder);
    if (!field.ok) return field;
    data.sortOrder = field.value;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "수정할 필드를 하나 이상 입력하세요." };
  }
  return { ok: true, value: data };
}
