"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BenchmarkDeltaLabel,
  useBenchmarks,
} from "@/lib/client/use-benchmarks";
import { formatKRW, formatManwon } from "@/lib/domain/totals";
import { lowestQuoteIds } from "@/lib/domain/tone";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/** 비교 API 응답의 quotes 요소(총액은 조회 시점 계산값). */
type CompareQuoteSummary = {
  quoteId: string;
  vendorName: string;
  quoteDate: string;
  guestCount: number;
  minTotal: number;
  withOptionsTotal: number;
  perGuest: number | null;
};

/** 비교 API 응답의 rows 요소. itemCode null 행은 미분류(기타) 그룹이다. */
type CompareRow = {
  itemCode: string | null;
  label: string;
  perQuote: Record<string, number | null>;
};

type CompareResult = {
  quotes: CompareQuoteSummary[];
  rows: CompareRow[];
};

/** 에러 본문 {error: string}에서 메시지를 꺼낸다. JSON이 아니면 null. */
async function errorOf(res: Response): Promise<string | null> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
  } catch {
    return null; // JSON이 아닌 응답(예: 라우트 부재의 404 HTML)
  }
  return null;
}

function isCompareQuoteSummary(value: unknown): value is CompareQuoteSummary {
  if (typeof value !== "object" || value === null) return false;
  return (
    "quoteId" in value &&
    typeof value.quoteId === "string" &&
    "vendorName" in value &&
    typeof value.vendorName === "string" &&
    "quoteDate" in value &&
    typeof value.quoteDate === "string" &&
    "guestCount" in value &&
    typeof value.guestCount === "number" &&
    "minTotal" in value &&
    typeof value.minTotal === "number" &&
    "withOptionsTotal" in value &&
    typeof value.withOptionsTotal === "number" &&
    "perGuest" in value &&
    (value.perGuest === null || typeof value.perGuest === "number")
  );
}

function isCompareRow(value: unknown): value is CompareRow {
  if (typeof value !== "object" || value === null) return false;
  if (!("itemCode" in value && (value.itemCode === null || typeof value.itemCode === "string"))) {
    return false;
  }
  if (!("label" in value && typeof value.label === "string")) return false;
  if (!("perQuote" in value && typeof value.perQuote === "object" && value.perQuote !== null)) {
    return false;
  }
  return Object.values(value.perQuote).every((amount) => amount === null || typeof amount === "number");
}

function isCompareResult(value: unknown): value is CompareResult {
  if (typeof value !== "object" || value === null) return false;
  if (!("quotes" in value && Array.isArray(value.quotes))) return false;
  if (!("rows" in value && Array.isArray(value.rows))) return false;
  return value.quotes.every(isCompareQuoteSummary) && value.rows.every(isCompareRow);
}

/** 요약 카드 1장. 로딩 중에는 같은 구조의 스켈레톤(라벨 + "…")으로 렌더한다. */
function SummaryCard({
  vendorName,
  minTotal,
  withOptionsTotal,
  perGuest,
  lowest,
}: {
  vendorName: string;
  minTotal: string;
  withOptionsTotal: string;
  perGuest: string;
  lowest: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-muted">{vendorName}</p>
        {lowest && <Badge tone="positive">✓ 최저 총액</Badge>}
      </div>
      <p className="mt-1 text-[22px] font-bold tracking-tight tabular-nums sm:text-[26px]">{withOptionsTotal}</p>
      <p className="text-xs text-ink-subtle">옵션 포함 총액</p>
      <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-ink-muted">최소총액 (필수 항목)</dt>
          <dd className="font-semibold tabular-nums">{minTotal}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-ink-muted">1인당비용</dt>
          <dd className="font-semibold tabular-nums">{perGuest}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default function CompareClient({
  projectId,
  ids,
}: {
  projectId: string;
  ids: string[];
}) {
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const benchmarks = useBenchmarks(projectId);
  const router = useRouter();

  // 상태를 바꾸지 않는 순수 페처 — 이펙트의 .then 콜백에서만 상태를 바꾼다.
  const fetchCompare = useCallback(
    async (): Promise<{ ok: true; data: CompareResult } | { ok: false; message: string }> => {
      const res = await fetch(
        `/api/projects/${projectId}/quotes/compare?ids=${ids.join(",")}`,
        { credentials: "include" },
      );
      if (res.status === 401) {
        router.replace("/login");
        return { ok: false, message: "로그인이 필요합니다." };
      }
      if (!res.ok) {
        const message = (await errorOf(res)) ?? `비교 정보를 불러올 수 없습니다. (${res.status})`;
        return { ok: false, message };
      }
      const body: unknown = await res.json();
      if (!isCompareResult(body)) {
        return { ok: false, message: "비교 응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, data: body };
    },
    [projectId, ids, router],
  );

  useEffect(() => {
    let active = true;
    fetchCompare()
      .then((result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError(result.message);
      })
      .catch(() => {
        if (active) setError("네트워크 오류가 발생했습니다.");
      });
    return () => {
      active = false;
    };
  }, [fetchCompare]);

  const loading = data === null && error === null;
  const lowestTotalIds =
    data === null
      ? []
      : lowestQuoteIds(Object.fromEntries(data.quotes.map((quote) => [quote.quoteId, quote.withOptionsTotal])));

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader
        title="견적 비교"
        meta={data === null ? undefined : <span>견적 {data.quotes.length}건</span>}
      />

      {error !== null && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" aria-label="총액 요약">
        {loading && <SummaryCard vendorName="…" minTotal="…" withOptionsTotal="…" perGuest="…" lowest={false} />}
        {data?.quotes.map((quote) => (
          <SummaryCard
            key={quote.quoteId}
            vendorName={quote.vendorName}
            minTotal={formatKRW(quote.minTotal)}
            withOptionsTotal={formatManwon(quote.withOptionsTotal)}
            perGuest={quote.perGuest === null ? "인원 미정" : formatKRW(quote.perGuest)}
            lowest={lowestTotalIds.includes(quote.quoteId)}
          />
        ))}
      </section>

      <Card title="항목 비교">
        {loading && <p className="text-sm text-ink-muted">비교 항목을 불러오는 중…</p>}
        {data !== null && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="sticky left-0 z-10 bg-surface py-2.5 pr-3 text-left align-bottom text-[13px] font-medium text-ink-muted">
                    항목
                  </th>
                  {data.quotes.map((quote) => (
                    <th key={quote.quoteId} className="px-3 py-2.5 text-right align-bottom font-normal">
                      <span className="block text-sm font-semibold text-ink">{quote.vendorName}</span>
                      <span className="block whitespace-nowrap text-xs tabular-nums text-ink-subtle">
                        {quote.quoteDate.slice(0, 10)} · 보장 {quote.guestCount}명
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => {
                  const lowest = lowestQuoteIds(row.perQuote);
                  return (
                    <tr key={row.itemCode ?? `etc-${index}`} className="border-b border-line">
                      <th scope="row" className="sticky left-0 z-10 bg-surface py-2.5 pr-3 text-left font-normal text-ink-muted">
                        {row.label}
                      </th>
                      {data.quotes.map((quote) => {
                        const amount = row.perQuote[quote.quoteId] ?? null;
                        return (
                          <td key={quote.quoteId} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {amount === null ? (
                              <Badge tone="neutral">없음</Badge>
                            ) : (
                              <>
                                <span
                                  className={lowest.includes(quote.quoteId) ? "font-semibold text-positive" : undefined}
                                >
                                  {formatKRW(amount)}
                                </span>
                                <BenchmarkDeltaLabel source={benchmarks} itemCode={row.itemCode} amount={amount} />
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface py-3 pr-3 text-left font-semibold">
                    옵션 포함 총액
                  </th>
                  {data.quotes.map((quote) => (
                    <td
                      key={quote.quoteId}
                      className="whitespace-nowrap px-3 py-3 text-right text-[15px] font-bold tabular-nums"
                    >
                      {formatKRW(quote.withOptionsTotal)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>
            <b className="text-positive">파란 굵은 금액</b> 항목별 최저가
          </span>
          <span>&apos;없음&apos; 해당 견적에 없는 항목</span>
          <span>평균 대비 ±% 같은 지역 참가격 평균과의 차이 (출처: 한국소비자원 참가격)</span>
        </p>
      </Card>
    </main>
  );
}
