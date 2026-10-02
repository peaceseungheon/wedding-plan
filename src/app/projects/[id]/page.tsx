"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatKRW, formatManwon } from "@/lib/domain/totals";
import { budgetTone, type Tone } from "@/lib/domain/tone";
import { paymentLabelText } from "@/lib/constants/payment-labels";
import { REGION_OPTIONS, isRegionOption } from "@/lib/constants/regions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";

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

/** 계약 총액이 예산 대비 어떤 상태인지 배지 문구로 바꾼다. */
function describeContracted(contracted: number, budget: number): { tone: Tone; text: string } {
  const tone = budgetTone(contracted, budget);
  if (tone === "neutral") return { tone, text: "예산 미설정" };
  if (tone === "negative") return { tone, text: `▲ ${formatManwon(contracted - budget)} 초과` };
  if (tone === "caution") return { tone, text: `! 예산의 ${Math.round((contracted / budget) * 100)}%` };
  return { tone, text: `✓ 남은 예산 ${formatManwon(budget - contracted)}` };
}

/** 예식일은 UTC 자정으로 저장되므로(parseWeddingDate) UTC 기준으로 표시한다. */
const weddingDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "UTC",
});

function ProjectMeta({ project }: { project: ProjectInfo }) {
  const items = [
    project.weddingDate === null ? "예식일 미정" : weddingDateFormatter.format(new Date(project.weddingDate)),
    project.region ?? "지역 미정",
    project.guestCount === null ? "하객 미정" : `하객 ${project.guestCount}명`,
  ];
  return items.map((item) => <span key={item}>{item}</span>);
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
  const budgetTotal = dashboard?.budgetTotal ?? 0;
  const progress = dashboard === null ? null : dashboard.tasksProgress;
  const progressRatio = progress !== null && progress.total > 0 ? progress.done / progress.total : 0;
  const contracted = dashboard === null ? null : describeContracted(dashboard.contractedTotal, budgetTotal);

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader
        title={project === null ? "…" : project.title}
        meta={project === null ? undefined : <ProjectMeta project={project} />}
        aside={
          <div className="sm:text-right">
            <p className="text-xs text-ink-subtle">예식까지</p>
            <p
              className={`font-serif font-semibold leading-none tabular-nums text-accent ${
                dDay === null ? "mt-1 text-xl" : "text-4xl sm:text-[44px]"
              }`}
            >
              {dashboard === null ? "…" : formatDDay(dDay)}
            </p>
          </div>
        }
      />

      {loadError !== null && (
        <p role="alert" className="text-sm text-negative">
          {loadError}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4" aria-label="예산 요약">
        <Stat label="예산 총액" value={dashboard === null ? "…" : formatManwon(dashboard.budgetTotal)}>
          {dashboard !== null && (
            <span className="text-ink-subtle">카테고리 {dashboard.budgetByCategory.length}개</span>
          )}
        </Stat>
        <Stat label="계약 총액" value={dashboard === null ? "…" : formatManwon(dashboard.contractedTotal)}>
          {dashboard !== null && contracted !== null && (
            <>
              <Badge tone={contracted.tone}>{contracted.text}</Badge>
              {budgetTotal > 0 && (
                <Progress
                  label="예산 대비 계약 총액"
                  value={dashboard.contractedTotal / budgetTotal}
                  tone={contracted.tone}
                />
              )}
            </>
          )}
        </Stat>
        <Stat label="결제 완료" value={dashboard === null ? "…" : formatManwon(dashboard.paidTotal)}>
          {dashboard !== null && dashboard.contractedTotal > 0 && (
            <>
              <span className="text-ink-muted">
                계약 총액의 {Math.round((dashboard.paidTotal / dashboard.contractedTotal) * 100)}%
              </span>
              <Progress
                label="계약 총액 대비 결제 완료"
                value={dashboard.paidTotal / dashboard.contractedTotal}
                tone="accent"
              />
            </>
          )}
        </Stat>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title="카테고리별 예산"
          action={<CardLink href={`/projects/${projectId}/budget`}>예산 편집</CardLink>}
        >
          {dashboard === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
          {dashboard !== null && dashboard.budgetByCategory.length === 0 && (
            <p className="text-sm text-ink-muted">예산 카테고리가 없습니다.</p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {(dashboard?.budgetByCategory ?? []).map((row) => (
              <li
                key={row.name}
                className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span className="truncate">{row.name}</span>
                <Progress
                  label={`${row.name} 예산 비중`}
                  value={budgetTotal > 0 ? row.plannedAmount / budgetTotal : 0}
                  tone="neutral"
                />
                {row.plannedAmount > 0 ? (
                  <span className="tabular-nums text-ink-muted">{formatManwon(row.plannedAmount)}</span>
                ) : (
                  <Badge tone="neutral">미정</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="다가오는 결제">
          {dashboard === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
          {dashboard !== null && dashboard.upcomingPayments.length === 0 && (
            <p className="text-sm text-ink-muted">다가오는 결제가 없습니다.</p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {(dashboard?.upcomingPayments ?? []).map((payment) => {
              const due = new Date(payment.dueDate);
              return (
                <li key={payment.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span className="w-11 shrink-0 rounded-lg border border-line py-1 text-center leading-tight tabular-nums">
                    <b className="block text-base">{due.getUTCDate()}</b>
                    <span className="text-[11px] text-ink-subtle">{due.getUTCMonth() + 1}월</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{paymentLabelText(payment.label)}</span>
                  <span className="font-semibold tabular-nums">{formatKRW(payment.amount)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="체크리스트 진행률" action={<CardLink href={`/projects/${projectId}/tasks`}>할 일</CardLink>}>
          <p className="mb-3 text-sm tabular-nums text-ink-muted">
            {progress === null
              ? "…"
              : `${progress.done}/${progress.total} 완료 (${Math.round(progressRatio * 100)}%)`}
          </p>
          <Progress label="체크리스트 진행률" value={progressRatio} tone="accent" />
        </Card>
        <Card title="업체 · 견적" action={<CardLink href={`/projects/${projectId}/vendors`}>업체 관리</CardLink>}>
          <p className="text-sm text-ink-muted">
            업체 <b className="tabular-nums text-ink">{dashboard === null ? "…" : dashboard.vendorCount}</b>개 · 견적{" "}
            <b className="tabular-nums text-ink">{dashboard === null ? "…" : dashboard.quoteCount}</b>건
          </p>
        </Card>
      </div>

      <Card title="계약 목록">
        {contracts === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
        {contracts !== null && contracts.length === 0 && <p className="text-sm text-ink-muted">계약이 없습니다.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {(contracts ?? []).map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${projectId}/contracts/${row.id}`}
                className="flex items-baseline justify-between gap-3 py-3 text-sm hover:text-accent"
              >
                <span className="font-medium">{row.vendorNameSnapshot}</span>
                <span className="tabular-nums text-ink-muted">
                  {formatKRW(row.amountSnapshot)} · {row.signedDate.slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="프로젝트 설정">
        <form onSubmit={saveSettings} className="flex flex-col gap-4">
          <Field label="제목">
            <input
              required
              className={inputClass}
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
            <Field label="예식일" hint="비우면 미정">
              <input
                type="date"
                className={inputClass}
                value={form.weddingDate}
                onChange={(event) => setForm((prev) => ({ ...prev, weddingDate: event.target.value }))}
              />
            </Field>
            <Field label="지역">
              <select
                className={inputClass}
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
            </Field>
            <Field label="하객 인원">
              <input
                type="number"
                className={inputClass}
                value={form.guestCount}
                onChange={(event) => setForm((prev) => ({ ...prev, guestCount: event.target.value }))}
              />
            </Field>
          </div>
          {saveError !== null && (
            <p role="alert" className="text-sm text-negative">
              {saveError}
            </p>
          )}
          <Button type="submit" disabled={saving} className="self-start">
            저장
          </Button>
        </form>
      </Card>
    </main>
  );
}
