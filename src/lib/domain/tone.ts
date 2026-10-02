/**
 * 화면 상태 톤 판정 순수 도메인. 임계값은 docs/design-system.md 5.1이 출처이며
 * 화면에서 하드코딩하지 않고 이 모듈만 쓴다.
 */

export type Tone = "positive" | "caution" | "negative" | "info" | "neutral";

/** 계획 대비 사용 비율이 이 값 이상이면 주의. */
export const BUDGET_CAUTION_RATIO = 0.9;

/** 지역 평균 대비 백분율이 이 값을 넘으면 위험. */
export const BENCHMARK_NEGATIVE_PERCENT = 20;

/** 계획 금액 대비 사용 금액의 톤. 계획이 0 이하면 비교 기준이 없어 neutral. */
export function budgetTone(used: number, planned: number): Tone {
  if (planned <= 0) return "neutral";
  const ratio = used / planned;
  if (ratio > 1) return "negative";
  if (ratio >= BUDGET_CAUTION_RATIO) return "caution";
  return "positive";
}

/** 지역 평균 대비 백분율(matchBenchmark 결과, 예: 4.2 = +4.2%)의 톤. */
export function benchmarkTone(percent: number): Tone {
  if (percent <= 0) return "positive";
  if (percent <= BENCHMARK_NEGATIVE_PERCENT) return "caution";
  return "negative";
}

/**
 * 견적별 금액 중 최저가인 견적 id들. 금액이 있는 견적이 2개 미만이거나
 * 전부 같은 금액이면 비교할 의미가 없어 빈 배열을 반환한다.
 */
export function lowestQuoteIds(perQuote: Readonly<Record<string, number | null>>): string[] {
  const entries = Object.entries(perQuote).filter(
    (entry): entry is [string, number] => entry[1] !== null,
  );
  if (entries.length < 2) return [];
  const min = Math.min(...entries.map(([, amount]) => amount));
  if (entries.every(([, amount]) => amount === min)) return [];
  return entries.filter(([, amount]) => amount === min).map(([id]) => id);
}
