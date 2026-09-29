/**
 * 견적 총액 계산 엔진. 도메인 계층 규칙(typescript.md)에 따라 Prisma·Next.js를
 * 임포트하지 않는 순수 함수만 둔다. 총액은 저장하지 않고 조회 시점마다 계산한다.
 *
 * VAT·DISCOUNT는 itemCode일 뿐이다. 엔진은 required/selected로만 포함 여부를
 * 판정하고 항목 코드·부호를 특별 취급하지 않는다(DISCOUNT는 항목 생성 시점에
 * 음수로 정규화되어 들어오므로 그대로 더하면 차감된다).
 */

/** quote_items 행의 구조적 최소 타입. Prisma 타입 대신 구조로 계약한다. */
export interface QuoteItemInput {
  /** Int KRW 금액. 할인은 음수다. */
  amount: number;
  required: boolean;
  selected: boolean;
  itemCode?: string | null;
}

/** 필수 항목만의 합계(계약 최소 금액). 빈 배열이면 0이다. */
export function minTotal(items: readonly QuoteItemInput[]): number {
  return items.reduce((sum, item) => (item.required ? sum + item.amount : sum), 0);
}

/** 필수 또는 선택된 항목의 합계(옵션 포함 총액). 미선택 옵션은 제외된다. */
export function withOptionsTotal(items: readonly QuoteItemInput[]): number {
  return items.reduce((sum, item) => (item.required || item.selected ? sum + item.amount : sum), 0);
}

/**
 * 옵션 포함 총액의 1인당 금액. 코드에서 유일한 나눗셈이며 버림(Math.floor)으로
 * 절사한다 — 총액이 음수면 -∞ 방향으로 버림이다(예: -1000/3 → -334).
 * guestCount가 0 이하면 인원이 정해지지 않은 것이므로 null.
 */
export function perGuest(items: readonly QuoteItemInput[], guestCount: number): number | null {
  if (guestCount <= 0) return null;
  return Math.floor(withOptionsTotal(items) / guestCount);
}

const krwFormatter = new Intl.NumberFormat("ko-KR");

/** 1,234,567 → "1,234,567원". 음수는 부호가 앞에 붙는다("-200,000원"). */
export function formatKRW(n: number): string {
  return `${krwFormatter.format(n)}원`;
}
