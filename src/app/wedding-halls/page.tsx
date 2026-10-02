"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 목록 카드에 필요한 필드만. disclosedAt은 ISO 문자열 또는 null. */
type HallRow = {
  readonly id: string;
  readonly region: string;
  readonly venueName: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly disclosedAt: string | null;
  readonly priceItemCount: number;
};

type ApiResult = { readonly ok: boolean; readonly status: number; readonly body: unknown };

async function request(path: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(path, { credentials: "include", ...init });
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

/** unknown 응답을 in-narrowing으로 좁힌다(코드베이스 관습). 형태가 다르면 null. */
function parseHalls(body: unknown): readonly HallRow[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rows = "weddingHalls" in body ? body.weddingHalls : undefined;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((item): HallRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const id = "id" in item ? item.id : undefined;
    if (typeof id !== "string") return [];
    const region = "region" in item ? item.region : undefined;
    if (typeof region !== "string") return [];
    const venueName = "venueName" in item ? item.venueName : undefined;
    if (typeof venueName !== "string") return [];
    const address = "address" in item ? item.address : undefined;
    const phone = "phone" in item ? item.phone : undefined;
    const disclosedAt = "disclosedAt" in item ? item.disclosedAt : undefined;
    const priceItemCount = "priceItemCount" in item ? item.priceItemCount : undefined;
    return [
      {
        id,
        region,
        venueName,
        address: typeof address === "string" ? address : null,
        phone: typeof phone === "string" ? phone : null,
        disclosedAt: typeof disclosedAt === "string" ? disclosedAt : null,
        priceItemCount: typeof priceItemCount === "number" ? priceItemCount : 0,
      },
    ];
  });
}

/** 가격이 없는(스킵된) 공개자료도 목록에는 남는다 — 항목 수 0건으로 표시. */
export default function WeddingHallsPage() {
  const router = useRouter();

  const [halls, setHalls] = useState<readonly HallRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<readonly string[]>([]);

  const api = useCallback(
    async (path: string): Promise<ApiResult> => {
      const result = await request(path);
      if (result.status === 401) {
        router.replace("/login");
      }
      return result;
    },
    [router],
  );

  // setState는 .then 콜백 안에서만 — react-hooks/set-state-in-effect 회피.
  const loadHalls = useCallback(
    (regionFilter: string): Promise<void> => {
      const query = regionFilter.length > 0 ? `?region=${encodeURIComponent(regionFilter)}` : "";
      return api(`/api/wedding-halls${query}`).then((result) => {
        if (result.ok) {
          const parsed = parseHalls(result.body);
          if (parsed === null) {
            setListError("예식장 목록 응답이 올바르지 않습니다.");
          } else {
            setHalls(parsed);
            setListError(null);
          }
        } else if (result.status !== 401) {
          setListError(apiError(result.body, "예식장 목록을 불러오지 못했습니다."));
        }
      });
    },
    [api],
  );

  useEffect(() => {
    // 첫 전체 로드에서 지역 옵션을 파생한다(별도 메타 API 없음).
    void request("/api/wedding-halls").then((result) => {
      if (result.status === 401) {
        router.replace("/login");
        return;
      }
      const parsed = parseHalls(result.body);
      if (parsed !== null) {
        setRegions([...new Set(parsed.map((row) => row.region))].sort());
      }
    });
    void loadHalls("");
  }, [loadHalls, router]);

  /** 필터 변경 즉시 재요청한다. 빈 값은 전체 지역. */
  function handleRegionChange(next: string): void {
    setRegion(next);
    void loadHalls(next);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">예식장 공개자료 조회</h1>
        <Link href="/" className="text-sm text-zinc-600 underline-offset-4 hover:underline">
          프로젝트로 돌아가기
        </Link>
      </div>
      <p className="text-sm text-zinc-600">
        한국소비자원 참가격(portal)에 공개된 예식장 가격·환급 기준을 수집한 목록입니다.
      </p>

      <label className="flex w-fit flex-col gap-1 text-sm">
        지역 필터
        <select
          className="rounded border border-zinc-300 px-3 py-2"
          value={region}
          onChange={(event) => handleRegionChange(event.target.value)}
        >
          <option value="">전체</option>
          {regions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {halls === null && listError === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
      {listError !== null && <p className="text-sm text-red-600">{listError}</p>}
      {halls !== null && halls.length === 0 && listError === null && (
        <p className="text-sm text-zinc-600">해당 조건의 예식장 공개자료가 없습니다.</p>
      )}

      <ul className="flex flex-col gap-2">
        {(halls ?? []).map((row) => (
          <li key={row.id}>
            <Link
              href={`/wedding-halls/${row.id}`}
              className="flex flex-col gap-1 rounded border border-zinc-200 p-3 hover:border-zinc-400"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.venueName}</span>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{row.region}</span>
              </span>
              <span className="text-sm text-zinc-600">
                {row.address !== null ? row.address : "주소 미공개"}
                {row.phone !== null ? ` · ${row.phone}` : ""}
              </span>
              <span className="text-sm text-zinc-500">
                {row.disclosedAt !== null ? `자료 공개일 ${row.disclosedAt.slice(0, 10)}` : "공개일 미확인"}
                {` · 가격 항목 ${row.priceItemCount}건`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
