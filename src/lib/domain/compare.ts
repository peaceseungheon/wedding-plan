/**
 * 견적 비교 집계 엔진. 도메인 계층 규칙(typescript.md)에 따라 Prisma·Next.js를
 * 임포트하지 않는 순수 함수만 둔다. 견적별 총액은 totals 엔진을 그대로 재사용하고,
 * 항목 행은 표준 코드별 / 미분류 rawName별로 그룹핑한다.
 *
 * 그룹핑 규칙:
 * - itemCode가 있으면 코드별 1행. 같은 견적 안에 같은 코드가 여러 행이면 합산한다.
 *   행 순서는 ITEM_CODES 표준 순서(비표준 코드는 뒤에 첫 등장 순)를 따른다.
 * - itemCode가 null이면 rawName 완전일치끼리 모아 '기타' 행으로 만든다.
 * - 어떤 견적에 그 그룹의 항목이 없으면 perQuote 값이 null이다(프론트에서 하이라이트).
 */

import { ITEM_CODES, ITEM_CODE_LABELS } from "@/lib/constants/item-codes";
import { minTotal, perGuest, withOptionsTotal } from "@/lib/domain/totals";

/** quote_items 행의 구조적 최소 타입. totals 계약에 rawName·itemCode 필수가 추가된다. */
export interface CompareItemInput {
  itemCode: string | null;
  rawName: string;
  amount: number;
  required: boolean;
  selected: boolean;
}

/** 비교 대상 견적 1개의 구조적 입력. 라우트가 Prisma 행을 이 모양으로 맵핑한다. */
export interface CompareQuoteInput {
  quoteId: string;
  vendorName: string;
  quoteDate: Date;
  guestCount: number;
  items: readonly CompareItemInput[];
}

/** 응답의 quotes 요소. 총액은 조회 시점마다 계산하며 저장하지 않는다. */
export interface CompareQuoteSummary {
  quoteId: string;
  vendorName: string;
  quoteDate: string;
  guestCount: number;
  minTotal: number;
  withOptionsTotal: number;
  perGuest: number | null;
}

/** 응답의 rows 요소. itemCode null 행은 미분류 rawName 그룹이다. */
export interface CompareRow {
  itemCode: string | null;
  label: string;
  perQuote: Record<string, number | null>;
}

export interface CompareResult {
  quotes: CompareQuoteSummary[];
  rows: CompareRow[];
}

/** 좁은 키(ItemCode)의 라벨 맵을 문자열 인덱스로 넓혀 비표준 코드도 캐스트 없이 조회한다. */
const CODE_LABELS: Readonly<Record<string, string>> = ITEM_CODE_LABELS;
const STANDARD_CODES: ReadonlySet<string> = new Set(ITEM_CODES);
const ETC_LABEL: string = ITEM_CODE_LABELS.ETC;

function labelForCode(code: string): string {
  return code in CODE_LABELS ? CODE_LABELS[code] : code;
}

/** 그룹 키(코드 또는 rawName)별 견적별 합계 누적. */
type GroupSums = Map<string, number>;

function addAmount(sums: GroupSums, quoteId: string, amount: number): void {
  const current = sums.get(quoteId);
  sums.set(quoteId, current === undefined ? amount : current + amount);
}

/** 각 견적이 그 그룹을 갖지 않으면 null이 되는 perQuote 객체를 만든다. */
function toPerQuote(sums: GroupSums | undefined, quoteIds: readonly string[]): Record<string, number | null> {
  const perQuote: Record<string, number | null> = {};
  for (const quoteId of quoteIds) {
    const sum = sums === undefined ? undefined : sums.get(quoteId);
    perQuote[quoteId] = sum === undefined ? null : sum;
  }
  return perQuote;
}

/**
 * 견적 목록을 비교 응답으로 집계한다. 견적 순서가 요약·행의 열 순서를 결정한다.
 * 합계 금액은 Int(KRW) 산술만 사용하고 나눗셈은 perGuest의 버림 하나뿐이다.
 */
export function buildCompare(quotes: readonly CompareQuoteInput[]): CompareResult {
  const quoteIds = quotes.map((quote) => quote.quoteId);

  // CompareItemInput은 totals.ts의 QuoteItemInput(amount/required/selected/itemCode)을
  // 구조적으로 포함하므로 totals 함수에 그대로 통과한다.
  const summaries: CompareQuoteSummary[] = quotes.map((quote) => ({
    quoteId: quote.quoteId,
    vendorName: quote.vendorName,
    quoteDate: quote.quoteDate.toISOString(),
    guestCount: quote.guestCount,
    minTotal: minTotal(quote.items),
    withOptionsTotal: withOptionsTotal(quote.items),
    perGuest: perGuest(quote.items, quote.guestCount),
  }));

  const codedGroups = new Map<string, GroupSums>();
  const rawGroups = new Map<string, GroupSums>();

  for (const quote of quotes) {
    for (const item of quote.items) {
      const groups = item.itemCode === null ? rawGroups : codedGroups;
      const key = item.itemCode ?? item.rawName;
      const sums = groups.get(key) ?? new Map<string, number>();
      addAmount(sums, quote.quoteId, item.amount);
      groups.set(key, sums);
    }
  }

  const codedKeys = [
    ...ITEM_CODES.filter((code) => codedGroups.has(code)),
    ...[...codedGroups.keys()].filter((code) => !STANDARD_CODES.has(code)),
  ];

  const rows: CompareRow[] = [
    ...codedKeys.map((code): CompareRow => ({
      itemCode: code,
      label: labelForCode(code),
      perQuote: toPerQuote(codedGroups.get(code), quoteIds),
    })),
    ...[...rawGroups.keys()].map((rawName): CompareRow => ({
      itemCode: null,
      label: ETC_LABEL,
      perQuote: toPerQuote(rawGroups.get(rawName), quoteIds),
    })),
  ];

  return { quotes: summaries, rows };
}
