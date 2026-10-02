"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatManwon } from "@/lib/domain/totals";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";

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
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader title="예산 관리" />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="예산 요약">
        <Stat label="예산 합계" value={rows === null ? "…" : formatManwon(total)}>
          {rows !== null && <span className="text-ink-subtle">카테고리 {rows.length}개</span>}
        </Stat>
      </section>

      <Card title="카테고리별 예산">
        <div className="flex flex-col gap-4">
          {loadError !== null && (
            <p role="alert" className="text-sm text-negative">
              {loadError}
            </p>
          )}
          {rows === null && loadError === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
          {rows !== null && (
            <ul className="flex flex-col divide-y divide-line">
              {rows.map((row, index) => (
                <li
                  key={row.id ?? `new-${index}`}
                  className="flex items-center gap-2 py-3 first:pt-0 last:pb-0"
                >
                  {row.id !== null ? (
                    <span className="min-w-0 flex-1 text-sm font-medium">{row.name}</span>
                  ) : (
                    <input
                      className={`${inputClass} min-w-0 flex-1`}
                      placeholder="새 카테고리 이름"
                      value={row.name}
                      onChange={(event) => updateName(index, event.target.value)}
                    />
                  )}
                  <div className="w-28 shrink-0 sm:w-36">
                    <input
                      type="number"
                      aria-label={`${row.name || "새 카테고리"} 예산`}
                      className={`${inputClass} text-right tabular-nums`}
                      value={row.amount}
                      onChange={(event) => updateAmount(index, event.target.value)}
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeRow(index)}>
                    삭제
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {saveError !== null && (
            <p role="alert" className="text-sm text-negative">
              {saveError}
            </p>
          )}
          {savedAt !== null && saveError === null && (
            <p role="status" className="text-sm text-positive">
              ✓ 저장되었습니다.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addRow}>
              행 추가
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || rows === null}>
              저장
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
