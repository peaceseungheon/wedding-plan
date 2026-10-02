"use client";

import { useEffect, useState } from "react";
import {
  formatBenchmarkDelta,
  latestSourcePeriod,
  matchBenchmark,
  type BenchmarkRow,
} from "@/lib/domain/benchmark";
import { benchmarkTone } from "@/lib/domain/tone";
import { Badge } from "@/components/ui/badge";

/**
 * 클라이언트 화면용 참가격 벤치마크 소비 프리미티브. 프로젝트 region을 조회해
 * 그 지역의 벤치마크 행을 얻고, 항목 셀에 "지역 평균 대비" 라벨을 그린다.
 * region 미지정·조회 실패·미인증·매칭 실패는 모두 "미표시"로 수렴한다 —
 * 에러로 승격시키지 않는다(인증 만료 리다이렉트는 화면의 주 데이터 페처가 담당).
 */
export type BenchmarkSource = {
  readonly region: string;
  readonly rows: readonly BenchmarkRow[];
};

function isBenchmarkRow(value: unknown): value is BenchmarkRow {
  if (typeof value !== "object" || value === null) return false;
  return (
    "region" in value &&
    typeof value.region === "string" &&
    "category" in value &&
    typeof value.category === "string" &&
    "itemCode" in value &&
    (value.itemCode === null || typeof value.itemCode === "string") &&
    "avgPrice" in value &&
    typeof value.avgPrice === "number" &&
    "sampleSize" in value &&
    typeof value.sampleSize === "number" &&
    "sourcePeriod" in value &&
    typeof value.sourcePeriod === "string"
  );
}

export function useBenchmarks(projectId: string): BenchmarkSource | null {
  const [source, setSource] = useState<BenchmarkSource | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const projectRes = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!projectRes.ok || !active) return;
      const projectBody: unknown = await projectRes.json();
      if (
        typeof projectBody !== "object" ||
        projectBody === null ||
        !("project" in projectBody) ||
        typeof projectBody.project !== "object" ||
        projectBody.project === null ||
        !("region" in projectBody.project) ||
        (projectBody.project.region !== null && typeof projectBody.project.region !== "string")
      ) {
        return;
      }
      const region = projectBody.project.region;
      if (region === null || !active) return;

      const benchRes = await fetch(`/api/benchmarks?region=${encodeURIComponent(region)}`, {
        credentials: "include",
      });
      if (!benchRes.ok || !active) return;
      const benchBody: unknown = await benchRes.json();
      if (
        typeof benchBody !== "object" ||
        benchBody === null ||
        !("benchmarks" in benchBody) ||
        !Array.isArray(benchBody.benchmarks)
      ) {
        return;
      }
      const rows = benchBody.benchmarks.filter(isBenchmarkRow);
      if (active) setSource({ region, rows });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectId]);

  return source;
}

/**
 * 셀 안의 "지역 평균 대비 ±x.x%" 라벨. 코드 없는 항목·벤치마크 미로딩·매칭
 * 실패는 아무것도 그리지 않는다. 기준 기간은 후보 행의 최신 기간이다.
 */
export function BenchmarkDeltaLabel({
  source,
  itemCode,
  amount,
}: {
  source: BenchmarkSource | null;
  itemCode: string | null;
  amount: number;
}) {
  if (source === null || itemCode === null) return null;
  const period = latestSourcePeriod(source.rows);
  if (period === null) return null;
  const delta = matchBenchmark({
    region: source.region,
    itemCode,
    amount,
    rows: source.rows,
    sourcePeriod: period,
  });
  if (delta === null) return null;
  return (
    <span className="mt-1 block">
      <Badge tone={benchmarkTone(delta)}>평균 대비 {formatBenchmarkDelta(delta)}</Badge>
    </span>
  );
}
