import { describe, expect, it } from "vitest";
import {
  BENCHMARK_CATEGORY_BY_VENDOR,
  formatBenchmarkDelta,
  latestSourcePeriod,
  matchBenchmark,
  type BenchmarkRow,
} from "@/lib/domain/benchmark";

/** seed.ts의 서울 행과 같은 모양의 벤치마크 행을 만든다. */
function row(
  region: string,
  category: string,
  itemCode: string | null,
  avgPrice: number,
  sourcePeriod = "2026-H1",
): BenchmarkRow {
  return { region, category, itemCode, avgPrice, sampleSize: 100, sourcePeriod };
}

/** 매칭 입력을 지역·코드·금액 중심으로 짧게 만든다. */
function match(
  region: string | null,
  itemCode: string | null,
  amount: number,
  rows: readonly BenchmarkRow[],
  sourcePeriod = "2026-H1",
  category?: Parameters<typeof matchBenchmark>[0]["category"],
) {
  return matchBenchmark({ region, itemCode, amount, rows, sourcePeriod, category });
}

describe("matchBenchmark 정확 매칭", () => {
  it("region+category+itemCode+period가 모두 같은 행과 매칭해 백분율을 돌려준다", () => {
    const rows = [row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000)];

    const percent = match("서울", "HALL_RENTAL", 24_000_000, rows, "2026-H1", "WEDDING_HALL");

    expect(percent).toBe(20);
  });

  it("지정한 sourcePeriod의 행만 후보로 본다", () => {
    const rows = [
      row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000, "2025-H2"),
      row("서울", "웨딩홀", "HALL_RENTAL", 10_000_000, "2026-H1"),
    ];

    const percent = match("서울", "HALL_RENTAL", 12_000_000, rows, "2026-H1");

    expect(percent).toBe(20); // 2025-H2의 20,000,000이 아니라 2026-H1의 10,000,000 기준
  });
});

describe("matchBenchmark 항목 우선", () => {
  it("항목 단위 행이 카테고리 대표(itemCode null) 행을 이긴다", () => {
    const rows = [
      row("서울", "웨딩홀", null, 10_000_000), // 카테고리 대표 행
      row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000), // 항목 단위 행
    ];

    const percent = match("서울", "HALL_RENTAL", 24_000_000, rows);

    expect(percent).toBe(20); // 10,000,000 기준이면 +140이므로 항목 행이 이겨야 한다
  });

  it("항목 단위 행이 없으면 카테고리 대표 행으로 대체 매칭한다", () => {
    const rows = [row("서울", "웨딩홀", null, 10_000_000)];

    const percent = match("서울", "HALL_RENTAL", 12_000_000, rows);

    expect(percent).toBe(20);
  });
});

describe("matchBenchmark 매칭 없음", () => {
  it("region이 null이면 null이다(화면 미표시 계약)", () => {
    const rows = [row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000)];

    expect(match(null, "HALL_RENTAL", 24_000_000, rows)).toBeNull();
  });

  it("같은 region+period의 행이 없으면 null이다", () => {
    const rows = [row("경기", "웨딩홀", "HALL_RENTAL", 15_000_000)];

    expect(match("서울", "HALL_RENTAL", 24_000_000, rows)).toBeNull();
  });

  it("rows가 비어 있으면 null이다", () => {
    expect(match("서울", "HALL_RENTAL", 24_000_000, [])).toBeNull();
  });

  it("avgPrice가 0 이하인 행은 백분율이 정의되지 않아 null이다", () => {
    const rows = [row("서울", "웨딩홀", "HALL_RENTAL", 0)];

    expect(match("서울", "HALL_RENTAL", 24_000_000, rows)).toBeNull();
  });

  it("카테고리를 아는데 ETC(시드 범주 밖)면 매핑 자체가 없어 null이다", () => {
    const rows = [row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000)];

    expect(match("서울", "HALL_RENTAL", 24_000_000, rows, "2026-H1", "ETC")).toBeNull();
  });

  it("카테고리를 알면 다른 범주의 같은 코드 행과 매칭하지 않는다", () => {
    // 표준 코드는 범주가 겹치지 않는다는 전제의 방어: STUDIO 업체의 항목을
    // 웨딩홀 범주 행과 잘못 이어주지 않는다.
    const rows = [row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000)];

    expect(match("서울", "HALL_RENTAL", 24_000_000, rows, "2026-H1", "STUDIO")).toBeNull();
  });
});

describe("matchBenchmark 백분율 계산", () => {
  it("견적값이 평균보다 크면 양수다 (1,200,000 vs 1,000,000 → +20.0)", () => {
    const rows = [row("서울", "스드메", "STUDIO_BASE", 1_000_000)];

    expect(match("서울", "STUDIO_BASE", 1_200_000, rows)).toBe(20);
  });

  it("견적값이 평균보다 작으면 음수다", () => {
    const rows = [row("서울", "스드메", "STUDIO_BASE", 1_000_000)];

    expect(match("서울", "STUDIO_BASE", 800_000, rows)).toBe(-20);
  });

  it("소수 1자리 반올림이다 (23.4567… → 23.5)", () => {
    const rows = [row("서울", "스드메", "STUDIO_BASE", 1_000_000)];

    expect(match("서울", "STUDIO_BASE", 1_234_567, rows)).toBe(23.5);
  });

  it("itemCode가 null인 견적 항목은 카테고리 대표 행과만 매칭한다", () => {
    const rows = [
      row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000),
      row("서울", "웨딩홀", null, 10_000_000),
    ];

    expect(match("서울", null, 12_000_000, rows)).toBe(20);
  });
});

describe("latestSourcePeriod", () => {
  it("여러 기간이 섞였을 때 문자열 최댓값(가장 최근)을 고른다", () => {
    const rows = [
      row("서울", "웨딩홀", "HALL_RENTAL", 20_000_000, "2025-H2"),
      row("서울", "웨딩홀", "MEAL", 15_000_000, "2026-H1"),
      row("경기", "웨딩홀", "HALL_RENTAL", 15_000_000, "2026-H1"),
    ];

    expect(latestSourcePeriod(rows)).toBe("2026-H1");
  });

  it("빈 목록이면 null이다", () => {
    expect(latestSourcePeriod([])).toBeNull();
  });
});

describe("formatBenchmarkDelta", () => {
  it("양수에 +를 붙여 소수 1자리로 표시한다", () => {
    expect(formatBenchmarkDelta(20)).toBe("+20.0%");
  });

  it("음수는 부호를 유지하고 0은 +0.0%다", () => {
    expect(formatBenchmarkDelta(-94)).toBe("-94.0%");
    expect(formatBenchmarkDelta(0)).toBe("+0.0%");
  });
});

describe("BENCHMARK_CATEGORY_BY_VENDOR 매핑", () => {
  it("seed.ts의 시드 범주 문자열과 정확히 대응한다", () => {
    expect(BENCHMARK_CATEGORY_BY_VENDOR.WEDDING_HALL).toBe("웨딩홀");
    expect(BENCHMARK_CATEGORY_BY_VENDOR.STUDIO).toBe("스드메");
    expect(BENCHMARK_CATEGORY_BY_VENDOR.DRESS).toBe("스드메");
    expect(BENCHMARK_CATEGORY_BY_VENDOR.MAKEUP).toBe("스드메");
    expect(BENCHMARK_CATEGORY_BY_VENDOR.ETC).toBeUndefined();
  });
});
