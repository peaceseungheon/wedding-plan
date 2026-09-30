"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatKRW } from "@/lib/domain/totals";

/** 편집 행. id가 null이면 신규(저장 시 생성), amount는 input 문자열 그대로 둔다. */
type BudgetRow = {
  readonly id: string | null;
  readonly name: string;
  readonly amount: string;
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

/** GET 응답 {categories:[{id,name,plannedAmount,sortOrder}]}을 편집 행으로 좁힌다. */
function parseCategories(body: unknown): BudgetRow[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rows = "categories" in body ? body.categories : undefined;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((item): BudgetRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const id = "id" in item ? item.id : undefined;
    const name = "name" in item ? item.name : undefined;
    const plannedAmount = "plannedAmount" in item ? item.plannedAmount : undefined;
    if (typeof id !== "string" || typeof name !== "string" || typeof plannedAmount !== "number") {
      return [];
    }
    return [{ id, name, amount: String(plannedAmount) }];
  });
}

const AMOUNT_ERROR = "plannedAmount는 0 이상의 정수여야 합니다.";

export default function BudgetPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();

  const [rows, setRows] = useState<readonly BudgetRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const api = useCallback(
    async (path: string, init?: RequestInit): Promise<ApiResult> => {
      const result = await request(path, init);
      if (result.status === 401) {
        router.replace("/login");
      }
      return result;
    },
    [router],
  );

  const load = useCallback((): Promise<void> => {
    return api(`/api/projects/${projectId}/budget`).then((result) => {
      if (result.ok) {
        const parsed = parseCategories(result.body);
        if (parsed === null) {
          setLoadError("예산 응답이 올바르지 않습니다.");
        } else {
          setRows(parsed);
          setLoadError(null);
        }
      } else if (result.status !== 401) {
        setLoadError(apiError(result.body, "예산을 불러오지 못했습니다."));
      }
    });
  }, [api, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateAmount(index: number, amount: string): void {
    setRows((prev) =>
      prev === null ? prev : prev.map((row, i) => (i === index ? { ...row, amount } : row)),
    );
  }

  function updateName(index: number, name: string): void {
    setRows((prev) =>
      prev === null ? prev : prev.map((row, i) => (i === index ? { ...row, name } : row)),
    );
  }

  function removeRow(index: number): void {
    setRows((prev) => (prev === null ? prev : prev.filter((_, i) => i !== index)));
  }

  function addRow(): void {
    setRows((prev) => [...(prev ?? []), { id: null, name: "", amount: "0" }]);
  }

  /** 전체 교체 PUT. 정수 파싱만 클라이언트가 검사하고 0 미만·중복 이름은 서버 400에 맡긴다. */
  async function save(): Promise<void> {
    if (rows === null) return;
    const payload: Record<string, string | number>[] = [];
    for (const row of rows) {
      const name = row.name.trim();
      if (name.length === 0) {
        setSaveError("카테고리 이름을 입력하세요.");
        return;
      }
      const trimmed = row.amount.trim();
      const amount = trimmed === "" ? Number.NaN : Number(trimmed);
      if (Number.isNaN(amount) || !Number.isInteger(amount)) {
        setSaveError(AMOUNT_ERROR);
        return;
      }
      const item: Record<string, string | number> = { name, plannedAmount: amount };
      if (row.id !== null) item.id = row.id;
      payload.push(item);
    }
    setSaving(true);
    setSaveError(null);
    const result = await api(`/api/projects/${projectId}/budget`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (result.ok) {
      const parsed = parseCategories(result.body);
      if (parsed !== null) setRows(parsed);
      setSavedAt(Date.now());
      return;
    }
    if (result.status !== 401) {
      setSaveError(apiError(result.body, "예산 저장에 실패했습니다."));
    }
  }

  /** 파싱 가능한 행만 합산. 파싱 불가 행이 있으면 표시를 생략한다. */
  const total = (rows ?? []).reduce((sum, row) => {
    const amount = Number(row.amount.trim());
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-semibold">예산 관리</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">카테고리별 예산</h2>
          <span className="text-sm text-zinc-600">합계 {formatKRW(total)}</span>
        </div>
        {loadError !== null && <p className="text-sm text-red-600">{loadError}</p>}
        {rows === null && loadError === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
        {rows !== null && (
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li key={row.id ?? `new-${index}`} className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 p-3">
                {row.id !== null ? (
                  <span className="min-w-32 flex-1 text-sm font-medium">{row.name}</span>
                ) : (
                  <input
                    className="min-w-32 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="새 카테고리 이름"
                    value={row.name}
                    onChange={(event) => updateName(index, event.target.value)}
                  />
                )}
                <input
                  type="number"
                  aria-label={`${row.name || "새 카테고리"} 예산`}
                  className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm"
                  value={row.amount}
                  onChange={(event) => updateAmount(index, event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-red-600"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
        {saveError !== null && <p className="text-sm text-red-600">{saveError}</p>}
        {savedAt !== null && saveError === null && (
          <p className="text-sm text-emerald-700">저장되었습니다.</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-zinc-300 px-4 py-2 text-sm"
          >
            행 추가
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || rows === null}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </section>
    </main>
  );
}
