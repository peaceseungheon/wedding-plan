"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

/** 스키마 VENDOR_CATEGORY enum 값. 라벨은 페이지 로컬 상수로 둔다. */
const CATEGORY_OPTIONS = [
  { value: "WEDDING_HALL", label: "웨딩홀" },
  { value: "STUDIO", label: "스튜디오" },
  { value: "DRESS", label: "드레스" },
  { value: "MAKEUP", label: "메이크업" },
  { value: "ETC", label: "기타" },
] as const;

type VendorCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

/** Record 리터럴 초기화 — enum이 늘면 컴파일 에러로 드리프트를 잡는다. */
const CATEGORY_LABELS: Record<VendorCategory, string> = {
  WEDDING_HALL: "웨딩홀",
  STUDIO: "스튜디오",
  DRESS: "드레스",
  MAKEUP: "메이크업",
  ETC: "기타",
};

type VendorSummary = {
  readonly id: string;
  readonly name: string;
  readonly category: VendorCategory;
  readonly address: string | null;
  readonly phone: string | null;
};

type ProjectVendorRow = {
  readonly id: string;
  readonly memo: string | null;
  readonly status: "CANDIDATE" | "CONTRACTED";
  readonly isFavorite: boolean;
  readonly quoteCount: number;
  readonly vendor: VendorSummary;
};

/** 검색 API가 내려주는 카카오 결과(검색 결과에는 kakaoPlaceId가 없다). */
type SearchPlace = {
  readonly placeName: string;
  readonly address: string;
  readonly roadAddress: string;
  readonly phone: string;
  readonly placeUrl: string;
};

type SearchPayload = {
  readonly fallback: "kakao" | "manual";
  readonly results: readonly SearchPlace[];
  readonly message: string | null;
};

type ManualForm = {
  readonly placeName: string;
  readonly category: VendorCategory;
  readonly address: string;
  readonly phone: string;
  readonly memo: string;
};

const EMPTY_MANUAL: ManualForm = {
  placeName: "",
  category: "WEDDING_HALL",
  address: "",
  phone: "",
  memo: "",
};

type ApiResult = { readonly ok: boolean; readonly status: number; readonly body: unknown };

/** 응답 본문은 unknown로 돌려 호출부에서 좁힌다. 401 리다이렉트는 호출부(useRouter)가 맡는다. */
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

function isVendorCategory(value: unknown): value is VendorCategory {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

function isVendorStatus(value: unknown): value is "CANDIDATE" | "CONTRACTED" {
  return value === "CANDIDATE" || value === "CONTRACTED";
}

function parseVendor(value: unknown): VendorSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const id = "id" in value ? value.id : undefined;
  if (typeof id !== "string") return null;
  const name = "name" in value ? value.name : undefined;
  if (typeof name !== "string") return null;
  const category = "category" in value ? value.category : undefined;
  if (!isVendorCategory(category)) return null;
  const address = "address" in value ? value.address : undefined;
  const phone = "phone" in value ? value.phone : undefined;
  return {
    id,
    name,
    category,
    address: typeof address === "string" ? address : null,
    phone: typeof phone === "string" ? phone : null,
  };
}

function parseProjectVendorRow(value: unknown): ProjectVendorRow | null {
  if (typeof value !== "object" || value === null) return null;
  const id = "id" in value ? value.id : undefined;
  if (typeof id !== "string") return null;
  const status = "status" in value ? value.status : undefined;
  if (!isVendorStatus(status)) return null;
  const isFavorite = "isFavorite" in value ? value.isFavorite : undefined;
  if (typeof isFavorite !== "boolean") return null;
  const quoteCount = "quoteCount" in value ? value.quoteCount : undefined;
  if (typeof quoteCount !== "number") return null;
  if (!("vendor" in value)) return null;
  const vendor = parseVendor(value.vendor);
  if (vendor === null) return null;
  const memo = "memo" in value ? value.memo : undefined;
  return { id, memo: typeof memo === "string" ? memo : null, status, isFavorite, quoteCount, vendor };
}

function parseVendorRows(body: unknown): ProjectVendorRow[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rows = "vendors" in body ? body.vendors : undefined;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((item): ProjectVendorRow[] => {
    const row = parseProjectVendorRow(item);
    return row === null ? [] : [row];
  });
}

function parseSearchPlace(value: unknown): SearchPlace | null {
  if (typeof value !== "object" || value === null) return null;
  const placeName = "placeName" in value ? value.placeName : undefined;
  if (typeof placeName !== "string") return null;
  const address = "address" in value ? value.address : undefined;
  if (typeof address !== "string") return null;
  const roadAddress = "roadAddress" in value ? value.roadAddress : undefined;
  if (typeof roadAddress !== "string") return null;
  const phone = "phone" in value ? value.phone : undefined;
  if (typeof phone !== "string") return null;
  const placeUrl = "placeUrl" in value ? value.placeUrl : undefined;
  if (typeof placeUrl !== "string") return null;
  return { placeName, address, roadAddress, phone, placeUrl };
}

function parseSearchPayload(body: unknown): SearchPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const fallback = "fallback" in body ? body.fallback : undefined;
  if (fallback !== "kakao" && fallback !== "manual") return null;
  const results = "results" in body ? body.results : undefined;
  if (!Array.isArray(results)) return null;
  const message = "message" in body ? body.message : undefined;
  return {
    fallback,
    results: results.flatMap((item): SearchPlace[] => {
      const place = parseSearchPlace(item);
      return place === null ? [] : [place];
    }),
    message: typeof message === "string" ? message : null,
  };
}

export default function VendorsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();

  const [rows, setRows] = useState<readonly ProjectVendorRow[]>([]);
  const [listPending, setListPending] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [places, setPlaces] = useState<readonly SearchPlace[]>([]);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resultCategories, setResultCategories] = useState<Record<number, VendorCategory>>({});
  const [registeredIndexes, setRegisteredIndexes] = useState<readonly number[]>([]);

  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<ManualForm>(EMPTY_MANUAL);
  const [manualError, setManualError] = useState<string | null>(null);

  /** 401이면 /login으로 보낸다(태스크 지정 동작). */
  const api = useCallback(
    async (path: string, init?: RequestInit): Promise<ApiResult> => {
      const result = await request(path, init);
      if (result.status === 401) {
        router.push("/login");
      }
      return result;
    },
    [router],
  );

  // setState는 .then 콜백 안에서만 — react-hooks/set-state-in-effect 회피.
  const loadVendors = useCallback((): Promise<void> => {
    return api(`/api/projects/${projectId}/vendors`).then((result) => {
      if (result.ok) {
        const parsed = parseVendorRows(result.body);
        if (parsed === null) {
          setListError("업체 목록 응답이 올바르지 않습니다.");
        } else {
          setRows(parsed);
          setListError(null);
        }
      } else if (result.status !== 401) {
        setListError(apiError(result.body, "업체 목록을 불러오지 못했습니다."));
      }
      setListPending(false);
    });
  }, [api, projectId]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    const result = await api(`/api/vendors/search?q=${encodeURIComponent(trimmed)}`);
    if (result.ok) {
      const parsed = parseSearchPayload(result.body);
      if (parsed === null) {
        setSearchError("검색 응답이 올바르지 않습니다.");
        return;
      }
      setSearched(true);
      setPlaces(parsed.results);
      // fallback=manual은 카카오 키 부재·실패 — 에러가 아니라 안내 메시지다.
      setFallbackMessage(parsed.fallback === "manual" ? parsed.message : null);
      setResultCategories({});
      setRegisteredIndexes([]);
      setSearchError(null);
    } else if (result.status !== 401) {
      setSearchError(apiError(result.body, "검색에 실패했습니다."));
    }
  }

  /** 카카오 결과에는 kakaoPlaceId가 없어 수동 경로(placeName+address+category)로 등록한다. */
  async function registerFromSearch(index: number, place: SearchPlace): Promise<void> {
    const address = place.roadAddress.length > 0 ? place.roadAddress : place.address;
    const body: Record<string, string> = {
      placeName: place.placeName,
      address,
      category: resultCategories[index] ?? "WEDDING_HALL",
    };
    const phone = place.phone.trim();
    if (phone.length > 0) body.phone = phone;
    const result = await api(`/api/projects/${projectId}/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.ok) {
      setRegisteredIndexes((prev) => [...prev, index]);
      void loadVendors();
    } else if (result.status !== 401) {
      setSearchError(apiError(result.body, "등록에 실패했습니다."));
    }
  }

  async function toggleFavorite(row: ProjectVendorRow): Promise<void> {
    const result = await api(`/api/projects/${projectId}/vendors/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !row.isFavorite }),
    });
    if (result.ok) {
      void loadVendors();
    } else if (result.status !== 401) {
      setListError(apiError(result.body, "즐겨찾기 변경에 실패했습니다."));
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body: Record<string, string> = {
      placeName: manual.placeName.trim(),
      address: manual.address.trim(),
      category: manual.category,
    };
    const phone = manual.phone.trim();
    if (phone.length > 0) body.phone = phone;
    const memo = manual.memo.trim();
    if (memo.length > 0) body.memo = memo;
    const result = await api(`/api/projects/${projectId}/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.ok) {
      setManual(EMPTY_MANUAL);
      setShowManual(false);
      void loadVendors();
    } else if (result.status !== 401) {
      setManualError(apiError(result.body, "등록에 실패했습니다."));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader title="업체 관리" meta={listPending ? undefined : <span>등록 업체 {rows.length}곳</span>} />

      <Card title="등록된 업체">
        {listPending && <p className="text-sm text-ink-muted">불러오는 중...</p>}
        {listError !== null && (
          <p role="alert" className="text-sm text-negative">
            {listError}
          </p>
        )}
        {!listPending && rows.length === 0 && listError === null && (
          <p className="text-sm text-ink-muted">등록된 업체가 없습니다.</p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavorite(row)}
                  aria-label={row.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  className="text-lg leading-none text-ink-muted hover:text-ink"
                >
                  {row.isFavorite ? "★" : "☆"}
                </button>
                <span className="font-medium">{row.vendor.name}</span>
                <Badge tone="neutral">{CATEGORY_LABELS[row.vendor.category]}</Badge>
                {row.status === "CONTRACTED" ? (
                  <Badge tone="positive">✓ 계약</Badge>
                ) : (
                  <Badge tone="neutral">후보</Badge>
                )}
                <span className="ml-auto tabular-nums text-ink-muted">견적 {row.quoteCount}건</span>
              </div>
              {row.vendor.address !== null && <p className="text-ink-muted">{row.vendor.address}</p>}
              {row.vendor.phone !== null && <p className="tabular-nums text-ink-muted">{row.vendor.phone}</p>}
              {row.memo !== null && <p className="text-ink-subtle">메모: {row.memo}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="업체 검색">
        <div className="flex flex-col gap-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체명으로 검색"
              aria-label="업체명"
            />
            <Button type="submit">검색</Button>
          </form>
          {fallbackMessage !== null && <p className="text-sm text-ink-muted">{fallbackMessage}</p>}
          {searchError !== null && (
            <p role="alert" className="text-sm text-negative">
              {searchError}
            </p>
          )}
          {places.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {places.map((place, index) => (
                <li key={`${place.placeName}-${index}`} className="flex flex-col gap-2 py-3 text-sm last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{place.placeName}</span>
                    {place.placeUrl.length > 0 && (
                      <a
                        href={place.placeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-ink-muted underline hover:text-ink"
                      >
                        카카오 페이지
                      </a>
                    )}
                  </div>
                  <p className="text-ink-muted">{place.roadAddress.length > 0 ? place.roadAddress : place.address}</p>
                  {place.phone.length > 0 && <p className="tabular-nums text-ink-muted">{place.phone}</p>}
                  <div className="flex items-center gap-2">
                    <select
                      className={`${inputClass} h-8 w-auto`}
                      value={resultCategories[index] ?? "WEDDING_HALL"}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (!isVendorCategory(next)) return;
                        setResultCategories((prev) => ({ ...prev, [index]: next }));
                      }}
                      aria-label="분류"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {registeredIndexes.includes(index) ? (
                      <p role="status" className="text-sm text-positive">
                        ✓ 등록됨
                      </p>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => void registerFromSearch(index, place)}>
                        등록
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {searched && fallbackMessage === null && places.length === 0 && searchError === null && (
            <p className="text-sm text-ink-muted">검색 결과가 없습니다.</p>
          )}
        </div>
      </Card>

      <Card
        title="직접 등록"
        action={
          <Button variant="ghost" size="sm" onClick={() => setShowManual((prev) => !prev)}>
            수치 등록
          </Button>
        }
      >
        {showManual ? (
          <form onSubmit={submitManual} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="이름">
                <input
                  required
                  className={inputClass}
                  value={manual.placeName}
                  onChange={(event) => setManual((prev) => ({ ...prev, placeName: event.target.value }))}
                />
              </Field>
              <Field label="분류">
                <select
                  className={inputClass}
                  value={manual.category}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!isVendorCategory(next)) return;
                    setManual((prev) => ({ ...prev, category: next }));
                  }}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="주소">
                <input
                  required
                  className={inputClass}
                  value={manual.address}
                  onChange={(event) => setManual((prev) => ({ ...prev, address: event.target.value }))}
                />
              </Field>
              <Field label="전화">
                <input
                  className={inputClass}
                  value={manual.phone}
                  onChange={(event) => setManual((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </Field>
            </div>
            <Field label="메모">
              <textarea
                className={`${inputClass} h-auto py-2`}
                rows={2}
                value={manual.memo}
                onChange={(event) => setManual((prev) => ({ ...prev, memo: event.target.value }))}
              />
            </Field>
            {manualError !== null && (
              <p role="alert" className="text-sm text-negative">
                {manualError}
              </p>
            )}
            <Button type="submit" variant="secondary" className="self-start">
              등록
            </Button>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">검색되지 않는 업체는 직접 입력해 등록합니다.</p>
        )}
      </Card>
    </main>
  );
}
