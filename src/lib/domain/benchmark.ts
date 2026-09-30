/**
 * 참가격(지역 평균) 매칭 순수 도메인. Prisma·Next에 의존하지 않는다 —
 * 벤치마크 API 라우트와 클라이언트 화면이 같은 매칭 규칙을 공유한다.
 * 벤치마크 행의 category는 시드·CSV의 원본 문자열("웨딩홈"이 아니라 "웨딩홀")이다.
 */

/** price_benchmarks 행 중 계약에 필요한 필드만 모은 구조 타입. */
export type BenchmarkRow = {
  readonly region: string;
  readonly category: string;
  readonly itemCode: string | null;
  readonly avgPrice: number;
  readonly sampleSize: number;
  readonly sourcePeriod: string;
};

/** vendors.category의 리터럴 유니언. Prisma VENDOR_CATEGORY와 구조적으로 동일하다. */
export type VendorCategory = "WEDDING_HALL" | "STUDIO" | "DRESS" | "MAKEUP" | "ETC";

/**
 * 업체 범주 → 벤치마크 category 매핑. 시드 문자열과 정확히 대응한다:
 * 웨딩홀 업종은 "웨딩홀" 행, 스드메 3업종(STUDIO·DRESS·MAKEUP)은 "스드메" 행.
 * ETC는 시드 범주 밖이라 매핑이 없다(매칭하지 않는다).
 */
export const BENCHMARK_CATEGORY_BY_VENDOR: Readonly<Partial<Record<VendorCategory, string>>> = {
  WEDDING_HALL: "웨딩홀",
  STUDIO: "스드메",
  DRESS: "스드메",
  MAKEUP: "스드메",
};

/** rows 중 가장 최근 sourcePeriod("YYYY-Hn"은 문자열 비교로 최신순 정렬이 성립). */
export function latestSourcePeriod(rows: readonly BenchmarkRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (latest === null || row.sourcePeriod > latest) {
      latest = row.sourcePeriod;
    }
  }
  return latest;
}

export type MatchBenchmarkInput = {
  /** 견적 프로젝트의 지역. 미지정(null)이면 매칭하지 않는다. */
  readonly region: string | null;
  /** 견적 항목의 표준 코드. null이면 카테고리 대표 행과만 매칭한다. */
  readonly itemCode: string | null;
  /** 견적 금액(항목 소계). */
  readonly amount: number;
  /** 후보 벤치마크 행. */
  readonly rows: readonly BenchmarkRow[];
  /** 기준 기간. 생략하면 rows의 최신 기간을 쓴다. */
  readonly sourcePeriod?: string;
  /** 견적 업체의 범주. 주어지면 매핑된 벤치마크 범주 행과만 매칭한다. */
  readonly category?: VendorCategory;
};

/**
 * 견적 항목 하나의 지역 평균 대비 백분율.
 *
 * 매칭은 (region, sourcePeriod)가 같고 category 제약을 통과한 행에서
 * 1) 항목 단위 행(itemCode 동일)을 우선하고, 2) 없으면 카테고리 대표 행
 * (itemCode null)으로 대체한다. itemCode가 null인 견적 항목은 카테고리
 * 대표 행과만 매칭한다. 매칭 실패와 avgPrice 0 이하는 모두 null이다 —
 * 화면은 null을 "미표시"로만 소비하고 에러로 승격시키지 않는다.
 *
 * 백분율 = (amount − avgPrice) / avgPrice × 100, 소수 1자리 반올림.
 */
export function matchBenchmark(input: MatchBenchmarkInput): number | null {
  if (input.region === null) return null;

  const period = input.sourcePeriod ?? latestSourcePeriod(input.rows);
  if (period === null) return null;

  const inPeriod = input.rows.filter(
    (row) => row.region === input.region && row.sourcePeriod === period,
  );

  // 매핑 없는 범주(ETC 등)는 애초에 비교 대상이 없으므로 매칭하지 않는다.
  let inCategory = inPeriod;
  if (input.category !== undefined) {
    const mapped = BENCHMARK_CATEGORY_BY_VENDOR[input.category];
    if (mapped === undefined) return null;
    inCategory = inPeriod.filter((row) => row.category === mapped);
  }

  const matched =
    (input.itemCode === null
      ? undefined
      : inCategory.find((row) => row.itemCode === input.itemCode)) ??
    inCategory.find((row) => row.itemCode === null);
  if (matched === undefined || matched.avgPrice <= 0) return null;

  const percent = ((input.amount - matched.avgPrice) / matched.avgPrice) * 100;
  return Math.round(percent * 10) / 10;
}

/** 백분율 화면 표기. 0 포함 양수는 +를 붙인다(+0.0%), 음수는 부호를 유지한다. */
export function formatBenchmarkDelta(percent: number): string {
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}
