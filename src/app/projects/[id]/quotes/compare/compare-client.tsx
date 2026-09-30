"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BenchmarkDeltaLabel,
  useBenchmarks,
} from "@/lib/client/use-benchmarks";
import { formatKRW } from "@/lib/domain/totals";

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
}: {
  vendorName: string;
  minTotal: string;
  withOptionsTotal: string;
  perGuest: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <p className="text-sm font-medium text-zinc-900">{vendorName}</p>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-zinc-500">최소총액 (필수 항목)</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{minTotal}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-zinc-500">옵션포함총액</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{withOptionsTotal}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-zinc-500">1인당비용</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{perGuest}</dd>
        </div>
      </dl>
    </div>
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 font-sans">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">견적 비교</h1>
      </header>

      {error !== null && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">총액 요약</h2>
        {loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard vendorName="…" minTotal="…" withOptionsTotal="…" perGuest="…" />
          </div>
        )}
        {data !== null && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.quotes.map((quote) => (
              <SummaryCard
                key={quote.quoteId}
                vendorName={quote.vendorName}
                minTotal={formatKRW(quote.minTotal)}
                withOptionsTotal={formatKRW(quote.withOptionsTotal)}
                perGuest={quote.perGuest === null ? "인원 미정" : formatKRW(quote.perGuest)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">항목 비교</h2>
        <p className="text-xs text-zinc-500">항목이 없는 견적은 &apos;없음&apos;으로 표시됩니다.</p>
        <p className="text-xs text-zinc-500">
          금액 아래 &apos;지역 평균 대비&apos;는 같은 지역 참가격 평균과의 차이입니다.
        </p>
        {loading && <p className="text-sm text-zinc-500">비교 항목을 불러오는 중…</p>}
        {data !== null && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-2 align-bottom font-medium">항목</th>
                  {data.quotes.map((quote) => (
                    <th key={quote.quoteId} className="py-2 pr-2 align-bottom font-medium">
                      <span className="block text-sm font-medium text-zinc-900">
                        {quote.vendorName}
                      </span>
                      <span className="block">{quote.quoteDate.slice(0, 10)}</span>
                      <span className="block">보장인원 {quote.guestCount}명</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={row.itemCode ?? `etc-${index}`} className="border-b border-zinc-100">
                    <th scope="row" className="py-2 pr-2 text-left font-medium text-zinc-700">
                      {row.label}
                    </th>
                    {data.quotes.map((quote) => {
                      const amount = row.perQuote[quote.quoteId] ?? null;
                      return amount === null ? (
                        <td key={quote.quoteId} className="py-2 pr-2">
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">없음</span>
                        </td>
                      ) : (
                        <td key={quote.quoteId} className="whitespace-nowrap py-2 pr-2 tabular-nums">
                          {formatKRW(amount)}
                          <BenchmarkDeltaLabel
                            source={benchmarks}
                            itemCode={row.itemCode}
                            amount={amount}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
