"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatKRW } from "@/lib/domain/totals";
import { REGION_OPTIONS, isRegionOption } from "@/lib/constants/regions";

type BudgetCategoryBar = { readonly name: string; readonly plannedAmount: number };
type UpcomingPayment = {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly dueDate: string;
};

/** GET /api/projects/{id}/dashboard 응답(contractedByVendorCategory는 화면 미사용). */
type Dashboard = {
  readonly budgetTotal: number;
  readonly budgetByCategory: readonly BudgetCategoryBar[];
  readonly contractedTotal: number;
  readonly paidTotal: number;
  readonly upcomingPayments: readonly UpcomingPayment[];
  readonly tasksProgress: { readonly done: number; readonly total: number };
  readonly quoteCount: number;
  readonly vendorCount: number;
  readonly dDay: number | null;
};

type ProjectInfo = {
  readonly id: string;
  readonly title: string;
  readonly weddingDate: string | null;
  readonly region: string | null;
  readonly guestCount: number | null;
};

type ContractRow = {
  readonly id: string;
  readonly vendorNameSnapshot: string;
  readonly amountSnapshot: number;
  readonly signedDate: string;
};

type SettingsForm = {
  readonly title: string;
  readonly weddingDate: string;
  readonly region: string;
  readonly guestCount: string;
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

function parseDashboard(body: unknown): Dashboard | null {
  if (typeof body !== "object" || body === null) return null;
  const budgetTotal = "budgetTotal" in body ? body.budgetTotal : undefined;
  if (typeof budgetTotal !== "number") return null;
  const contractedTotal = "contractedTotal" in body ? body.contractedTotal : undefined;
  if (typeof contractedTotal !== "number") return null;
  const paidTotal = "paidTotal" in body ? body.paidTotal : undefined;
  if (typeof paidTotal !== "number") return null;
  const quoteCount = "quoteCount" in body ? body.quoteCount : undefined;
  if (typeof quoteCount !== "number") return null;
  const vendorCount = "vendorCount" in body ? body.vendorCount : undefined;
  if (typeof vendorCount !== "number") return null;
  const dDay = "dDay" in body ? body.dDay : undefined;
  if (typeof dDay !== "number" && dDay !== null) return null;

  const categories = "budgetByCategory" in body ? body.budgetByCategory : undefined;
  if (!Array.isArray(categories)) return null;
  const budgetByCategory = categories.flatMap((item): BudgetCategoryBar[] => {
    if (typeof item !== "object" || item === null) return [];
    const name = "name" in item ? item.name : undefined;
    const plannedAmount = "plannedAmount" in item ? item.plannedAmount : undefined;
    return typeof name === "string" && typeof plannedAmount === "number"
      ? [{ name, plannedAmount }]
      : [];
  });

  const payments = "upcomingPayments" in body ? body.upcomingPayments : undefined;
  if (!Array.isArray(payments)) return null;
  const upcomingPayments = payments.flatMap((item): UpcomingPayment[] => {
    if (typeof item !== "object" || item === null) return [];
    const id = "id" in item ? item.id : undefined;
    const label = "label" in item ? item.label : undefined;
    const amount = "amount" in item ? item.amount : undefined;
    const dueDate = "dueDate" in item ? item.dueDate : undefined;
    return typeof id === "string" && typeof label === "string" &&
      typeof amount === "number" && typeof dueDate === "string"
      ? [{ id, label, amount, dueDate }]
      : [];
  });

  const progress = "tasksProgress" in body ? body.tasksProgress : undefined;
  if (typeof progress !== "object" || progress === null) return null;
  const done = "done" in progress ? progress.done : undefined;
  const total = "total" in progress ? progress.total : undefined;
  if (typeof done !== "number" || typeof total !== "number") return null;

  return {
    budgetTotal,
    contractedTotal,
    paidTotal,
    quoteCount,
    vendorCount,
    dDay,
    budgetByCategory,
    upcomingPayments,
    tasksProgress: { done, total },
  };
}

function parseProject(body: unknown): ProjectInfo | null {
  if (typeof body !== "object" || body === null || !("project" in body)) return null;
  const project = body.project;
  if (typeof project !== "object" || project === null) return null;
  const id = "id" in project ? project.id : undefined;
  if (typeof id !== "string") return null;
  const title = "title" in project ? project.title : undefined;
  if (typeof title !== "string") return null;
  const weddingDate = "weddingDate" in project ? project.weddingDate : undefined;
  const region = "region" in project ? project.region : undefined;
  const guestCount = "guestCount" in project ? project.guestCount : undefined;
  return {
    id,
    title,
    weddingDate: typeof weddingDate === "string" ? weddingDate : null,
    region: typeof region === "string" ? region : null,
    guestCount: typeof guestCount === "number" ? guestCount : null,
  };
}

function parseContracts(body: unknown): readonly ContractRow[] | null {
  if (!Array.isArray(body)) return null;
  return body.flatMap((item): ContractRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const id = "id" in item ? item.id : undefined;
    const vendorNameSnapshot = "vendorNameSnapshot" in item ? item.vendorNameSnapshot : undefined;
    const amountSnapshot = "amountSnapshot" in item ? item.amountSnapshot : undefined;
    const signedDate = "signedDate" in item ? item.signedDate : undefined;
    return typeof id === "string" && typeof vendorNameSnapshot === "string" &&
      typeof amountSnapshot === "number" && typeof signedDate === "string"
      ? [{ id, vendorNameSnapshot, amountSnapshot, signedDate }]
      : [];
  });
}

/**
 * D-Day 표기 형식(태스크 29 문서화):
 * - weddingDate 없음(dDay null) → "날짜 미정"
 * - dDay > 0 (예식일이 미래) → "D-{n}"     예: D-100
 * - dDay === 0 (예식일 오늘) → "D-day"
 * - dDay < 0 (예식일 경과)   → "D+{n}일"   예: D+7일
 */
function formatDDay(dDay: number | null): string {
  if (dDay === null) return "날짜 미정";
  if (dDay > 0) return `D-${dDay}`;
  if (dDay === 0) return "D-day";
  return `D+${-dDay}일`;
}

function toForm(project: ProjectInfo): SettingsForm {
  return {
    title: project.title,
    weddingDate: project.weddingDate !== null ? project.weddingDate.slice(0, 10) : "",
    region: project.region ?? "",
    guestCount: project.guestCount !== null ? String(project.guestCount) : "",
  };
}

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [contracts, setContracts] = useState<readonly ContractRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<SettingsForm>({ title: "", weddingDate: "", region: "", guestCount: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const loadProject = useCallback((): Promise<void> => {
    return api(`/api/projects/${projectId}`).then((result) => {
      if (result.ok) {
        const parsed = parseProject(result.body);
        if (parsed === null) {
          setLoadError("프로젝트 정보 응답이 올바르지 않습니다.");
        } else {
          setProject(parsed);
          setForm(toForm(parsed));
        }
      } else if (result.status !== 401) {
        setLoadError(apiError(result.body, "프로젝트 정보를 불러오지 못했습니다."));
      }
    });
  }, [api, projectId]);

  const loadDashboard = useCallback((): Promise<void> => {
    return api(`/api/projects/${projectId}/dashboard`).then((result) => {
      if (result.ok) {
        const parsed = parseDashboard(result.body);
        if (parsed === null) {
          setLoadError("대시보드 응답이 올바르지 않습니다.");
        } else {
          setDashboard(parsed);
        }
      } else if (result.status !== 401) {
        setLoadError(apiError(result.body, "대시보드를 불러오지 못했습니다."));
      }
    });
  }, [api, projectId]);

  const loadContracts = useCallback((): Promise<void> => {
    return api(`/api/projects/${projectId}/contracts`).then((result) => {
      if (result.ok) {
        const parsed = parseContracts(result.body);
        if (parsed === null) {
          setLoadError("계약 목록 응답이 올바르지 않습니다.");
        } else {
          setContracts(parsed);
        }
      } else if (result.status !== 401) {
        setLoadError(apiError(result.body, "계약 목록을 불러오지 못했습니다."));
      }
    });
  }, [api, projectId]);

  useEffect(() => {
    void loadProject();
    void loadDashboard();
    void loadContracts();
  }, [loadProject, loadDashboard, loadContracts]);

  /**
   * 설정 저장. 폼의 현재 값을 전 필드 PUT으로 확정한다 — 빈 선택 필드는 null(초기화).
   * weddingDate가 바뀌면 dDay와 체크리스트 마감일(서버)이 같이 재계산되므로 대시보드도 재로드.
   */
  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const guestTrimmed = form.guestCount.trim();
    const guestNumber = guestTrimmed === "" ? null : Number(guestTrimmed);
    if (guestNumber !== null && Number.isNaN(guestNumber)) {
      setSaveError("하객 인원은 0 이상의 정수여야 합니다.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await api(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        weddingDate: form.weddingDate === "" ? null : form.weddingDate,
        region: form.region === "" ? null : form.region,
        guestCount: guestNumber,
      }),
    });
    setSaving(false);
    if (result.ok) {
      void loadProject();
      void loadDashboard();
      return;
    }
    if (result.status !== 401) {
      setSaveError(apiError(result.body, "프로젝트 설정 저장에 실패했습니다."));
    }
  }

  const dDay = dashboard === null ? null : dashboard.dDay;
  const maxBudget = (dashboard?.budgetByCategory ?? []).reduce(
    (max, row) => Math.max(max, row.plannedAmount),
    0,
  );
  const progress = dashboard === null ? null : dashboard.tasksProgress;
  const progressPercent =
    progress !== null && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{project === null ? "…" : project.title}</h1>
        <span className="rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-700">
          D-Day {dashboard === null ? "…" : formatDDay(dDay)}
        </span>
      </header>

      {loadError !== null && <p className="text-sm text-red-600">{loadError}</p>}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="예산 요약">
        <div className="flex flex-col gap-1 rounded border border-zinc-200 p-3">
          <span className="text-sm text-zinc-600">예산 총액</span>
          <span className="text-lg font-semibold">
            {dashboard === null ? "…" : formatKRW(dashboard.budgetTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded border border-zinc-200 p-3">
          <span className="text-sm text-zinc-600">계약 총액</span>
          <span className="text-lg font-semibold">
            {dashboard === null ? "…" : formatKRW(dashboard.contractedTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded border border-zinc-200 p-3">
          <span className="text-sm text-zinc-600">완납 합</span>
          <span className="text-lg font-semibold">
            {dashboard === null ? "…" : formatKRW(dashboard.paidTotal)}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">카테고리별 예산</h2>
          <Link href={`/projects/${projectId}/budget`} className="text-sm text-blue-600 underline">
            예산 편집
          </Link>
        </div>
        {dashboard === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
        {dashboard !== null && dashboard.budgetByCategory.length === 0 && (
          <p className="text-sm text-zinc-600">예산 카테고리가 없습니다.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(dashboard?.budgetByCategory ?? []).map((row) => (
            <li key={row.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{row.name}</span>
                <span className="text-zinc-600">{formatKRW(row.plannedAmount)}</span>
              </div>
              <div className="h-2 w-full rounded bg-zinc-100">
                <div
                  className="h-2 rounded bg-zinc-700"
                  style={{
                    width:
                      maxBudget > 0
                        ? `${Math.round((row.plannedAmount / maxBudget) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">다가오는 결제</h2>
        {dashboard === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
        {dashboard !== null && dashboard.upcomingPayments.length === 0 && (
          <p className="text-sm text-zinc-600">다가오는 결제가 없습니다.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(dashboard?.upcomingPayments ?? []).map((payment) => (
            <li key={payment.id} className="flex items-baseline justify-between rounded border border-zinc-200 p-3 text-sm">
              <span>{payment.label}</span>
              <span className="text-zinc-600">
                {formatKRW(payment.amount)} · {payment.dueDate.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">체크리스트 진행률</h2>
          <span className="text-sm text-zinc-600">
            {progress === null ? "…" : `${progress.done}/${progress.total} (${progressPercent}%)`}
          </span>
        </div>
        <div className="h-2 w-full rounded bg-zinc-100">
          <div className="h-2 rounded bg-emerald-600" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">업체 · 견적</h2>
        <Link
          href={`/projects/${projectId}/vendors`}
          className="rounded border border-zinc-200 p-3 text-sm hover:border-zinc-400"
        >
          업체 {dashboard === null ? "…" : dashboard.vendorCount}개 · 견적{" "}
          {dashboard === null ? "…" : dashboard.quoteCount}건 — 업체 관리로 이동
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">계약 목록</h2>
        {contracts === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
        {contracts !== null && contracts.length === 0 && (
          <p className="text-sm text-zinc-600">계약이 없습니다.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(contracts ?? []).map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${projectId}/contracts/${row.id}`}
                className="flex items-baseline justify-between rounded border border-zinc-200 p-3 text-sm hover:border-zinc-400"
              >
                <span className="font-medium">{row.vendorNameSnapshot}</span>
                <span className="text-zinc-600">
                  {formatKRW(row.amountSnapshot)} · {row.signedDate.slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">프로젝트 설정</h2>
        <form onSubmit={saveSettings} className="flex flex-col gap-3 rounded border border-zinc-200 p-3">
          <label className="flex flex-col gap-1 text-sm">
            제목
            <input
              required
              className="rounded border border-zinc-300 px-3 py-2"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              예식일 (비우면 미정)
              <input
                type="date"
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.weddingDate}
                onChange={(event) => setForm((prev) => ({ ...prev, weddingDate: event.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              지역
              <select
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              >
                <option value="">미지정</option>
                {/* 드롭다운 이전 자유 텍스트 값 — 벤치마크 지역명과 불일치라 미연동임을 라벨로 알린다. */}
                {form.region !== "" && !isRegionOption(form.region) && (
                  <option value={form.region}>{form.region} (참가격 미연동)</option>
                )}
                {REGION_OPTIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-32 flex-col gap-1 text-sm">
              하객 인원
              <input
                type="number"
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.guestCount}
                onChange={(event) => setForm((prev) => ({ ...prev, guestCount: event.target.value }))}
              />
            </label>
          </div>
          {saveError !== null && <p className="text-sm text-red-600">{saveError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            저장
          </button>
        </form>
      </section>
    </main>
  );
}
