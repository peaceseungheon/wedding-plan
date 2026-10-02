"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatKRW } from "@/lib/domain/totals";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  DataTable,
  headRowClass,
  numClass,
  rowClass,
  tdClass,
  thClass,
} from "@/components/ui/table";

type PriceItemRow = {
  readonly hallName: string;
  readonly itemGroup: string | null;
  readonly itemName: string;
  readonly rawValue: string | null;
  readonly priceMin: number | null;
  readonly priceMax: number | null;
  readonly sortOrder: number;
};

type PolicyRow = {
  readonly periodText: string;
  readonly ruleText: string;
  readonly sortOrder: number;
};

type HallDetail = {
  readonly venueName: string;
  readonly region: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly fileName: string | null;
  readonly disclosedAt: string | null;
  readonly priceItems: readonly PriceItemRow[];
  readonly refundPolicies: readonly PolicyRow[];
};

type ApiResult = { readonly ok: boolean; readonly status: number; readonly body: unknown };

async function request(path: string): Promise<ApiResult> {
  const response = await fetch(path, { credentials: "include" });
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function apiError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = body.error;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** unknown 응답을 in-narrowing으로 좁힌다(코드베이스 관습). 형태가 다르면 null. */
function parseDetail(body: unknown): HallDetail | null {
  if (typeof body !== "object" || body === null) return null;
  const hall = "weddingHall" in body ? body.weddingHall : undefined;
  if (typeof hall !== "object" || hall === null) return null;
  const venueName = "venueName" in hall ? hall.venueName : undefined;
  if (typeof venueName !== "string") return null;
  const region = "region" in hall ? hall.region : undefined;
  if (typeof region !== "string") return null;
  const items = "priceItems" in hall ? hall.priceItems : undefined;
  if (!Array.isArray(items)) return null;
  const policies = "refundPolicies" in hall ? hall.refundPolicies : undefined;
  if (!Array.isArray(policies)) return null;

  const priceItems = items.flatMap((item): PriceItemRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const hallName = "hallName" in item ? item.hallName : undefined;
    const itemName = "itemName" in item ? item.itemName : undefined;
    const sortOrder = "sortOrder" in item ? item.sortOrder : undefined;
    if (typeof hallName !== "string" || typeof itemName !== "string" || typeof sortOrder !== "number") {
      return [];
    }
    return [
      {
        hallName,
        itemGroup: str("itemGroup" in item ? item.itemGroup : undefined),
        itemName,
        rawValue: str("rawValue" in item ? item.rawValue : undefined),
        priceMin: num("priceMin" in item ? item.priceMin : undefined),
        priceMax: num("priceMax" in item ? item.priceMax : undefined),
        sortOrder,
      },
    ];
  });

  const refundPolicies = policies.flatMap((item): PolicyRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const periodText = "periodText" in item ? item.periodText : undefined;
    const ruleText = "ruleText" in item ? item.ruleText : undefined;
    const sortOrder = "sortOrder" in item ? item.sortOrder : undefined;
    if (typeof periodText !== "string" || typeof ruleText !== "string" || typeof sortOrder !== "number") {
      return [];
    }
    return [{ periodText, ruleText, sortOrder }];
  });

  return {
    venueName,
    region,
    address: str("address" in hall ? hall.address : undefined),
    phone: str("phone" in hall ? hall.phone : undefined),
    fileName: str("fileName" in hall ? hall.fileName : undefined),
    disclosedAt: str("disclosedAt" in hall ? hall.disclosedAt : undefined),
    priceItems,
    refundPolicies,
  };
}

/** priceMin/priceMax 조합을 화면 표기로. 숫자가 없으면 rawValue 원문을 보여준다. */
function formatPrice(item: PriceItemRow): string {
  const min = item.priceMin;
  const max = item.priceMax;
  if (min === null && max === null) {
    return item.rawValue !== null && item.rawValue.length > 0 ? item.rawValue : "-";
  }
  if (min !== null && max !== null) {
    return min === max ? formatKRW(min) : `${formatKRW(min)} ~ ${formatKRW(max)}`;
  }
  if (min !== null) {
    return `${formatKRW(min)} ~`;
  }
  if (max !== null) {
    return `~ ${formatKRW(max)}`;
  }
  return "-";
}

export default function WeddingHallDetailPage() {
  const router = useRouter();
  const params = useParams<{ readonly id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const [hall, setHall] = useState<HallDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    (hallId: string): Promise<void> => {
      return request(`/api/wedding-halls/${encodeURIComponent(hallId)}`).then((result) => {
        if (result.status === 401) {
          router.replace("/login");
          return;
        }
        if (result.ok) {
          const parsed = parseDetail(result.body);
          if (parsed === null) {
            setLoadError("예식장 상세 응답이 올바르지 않습니다.");
          } else {
            setHall(parsed);
            setLoadError(null);
          }
        } else {
          setHall(null);
          setLoadError(apiError(result.body, "예식장 상세를 불러오지 못했습니다."));
        }
      });
    },
    [router],
  );

  useEffect(() => {
    if (id.length > 0) {
      void load(id);
    }
  }, [id, load]);

  // 홀 이름 순서를 유지한 채 항목을 홀별로 묶는다.
  const hallsByOrder: readonly string[] = hall === null ? [] : [...new Set(hall.priceItems.map((i) => i.hallName))];

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
        <PageHeader
          title={hall === null ? "예식장 상세" : hall.venueName}
          meta={
            hall === null ? undefined : (
              <>
                <Badge tone="neutral">{hall.region}</Badge>
                <span>{hall.address !== null ? hall.address : "주소 미공개"}</span>
                <span className="tabular-nums">{hall.phone !== null ? `연락처 ${hall.phone}` : "연락처 미공개"}</span>
                <span className="tabular-nums text-ink-subtle wrap-anywhere">
                  {hall.disclosedAt !== null ? `자료 공개일 ${hall.disclosedAt.slice(0, 10)}` : "공개일 미확인"}
                  {hall.fileName !== null ? ` · 원본 ${hall.fileName}` : ""}
                </span>
              </>
            )
          }
          aside={
            <Link
              href="/wedding-halls"
              className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              목록으로
            </Link>
          }
        />

        {hall === null && loadError === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
        {loadError !== null && (
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
        )}

        {hall !== null && (
          <>
            {hall.priceItems.length === 0 && (
              <p className="text-sm text-ink-muted">
                이 공개자료는 파싱 가능한 가격 항목이 없습니다(원본 파일 형식 미지원 등).
              </p>
            )}

            {hallsByOrder.map((hallName) => (
              <Card key={hallName} title={hallName}>
                <DataTable minWidth={420}>
                  <thead>
                    <tr className={headRowClass}>
                      <th className={thClass}>구분</th>
                      <th className={thClass}>항목</th>
                      <th className={`${thClass} text-right`}>가격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hall.priceItems
                      .filter((item) => item.hallName === hallName)
                      .map((item) => (
                        <tr key={item.sortOrder} className={rowClass}>
                          <td className={`${tdClass} text-ink-muted`}>{item.itemGroup ?? ""}</td>
                          <td className={tdClass}>{item.itemName}</td>
                          <td className={`${tdClass} ${numClass}`}>{formatPrice(item)}</td>
                        </tr>
                      ))}
                  </tbody>
                </DataTable>
              </Card>
            ))}

            {hall.refundPolicies.length > 0 && (
              <Card title="계약해지 위약금·환급 산정기준">
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {hall.refundPolicies.map((policy) => (
                    <li key={policy.sortOrder} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                      <span className="font-medium">{policy.periodText}</span>
                      <span className="text-ink-muted">{policy.ruleText}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
