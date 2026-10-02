"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REGION_OPTIONS } from "@/lib/constants/regions";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

/** 프로젝트 카드에 필요한 필드만. weddingDate는 ISO 문자열 또는 null. */
type ProjectRow = {
  readonly id: string;
  readonly title: string;
  readonly weddingDate: string | null;
  readonly region: string | null;
  readonly guestCount: number | null;
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
function parseProjects(body: unknown): readonly ProjectRow[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rows = "projects" in body ? body.projects : undefined;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((item): ProjectRow[] => {
    if (typeof item !== "object" || item === null) return [];
    const id = "id" in item ? item.id : undefined;
    if (typeof id !== "string") return [];
    const title = "title" in item ? item.title : undefined;
    if (typeof title !== "string") return [];
    const weddingDate = "weddingDate" in item ? item.weddingDate : undefined;
    const region = "region" in item ? item.region : undefined;
    const guestCount = "guestCount" in item ? item.guestCount : undefined;
    return [
      {
        id,
        title,
        weddingDate: typeof weddingDate === "string" ? weddingDate : null,
        region: typeof region === "string" ? region : null,
        guestCount: typeof guestCount === "number" ? guestCount : null,
      },
    ];
  });
}

/** 대시보드의 ProjectMeta와 같은 구성(날짜 · 지역 · 하객) — 항목이 없으면 "미정"으로 채운다. */
function ProjectRowMeta({ row }: { row: ProjectRow }) {
  return (
    <>
      <span className="tabular-nums">
        {row.weddingDate === null ? "예식일 미정" : `예식일 ${row.weddingDate.slice(0, 10)}`}
      </span>
      <span>{row.region ?? "지역 미정"}</span>
      <span className="tabular-nums">{row.guestCount === null ? "하객 미정" : `하객 ${row.guestCount}명`}</span>
    </>
  );
}

type CreateForm = { readonly title: string; readonly weddingDate: string; readonly region: string; readonly guestCount: string };

const EMPTY_FORM: CreateForm = { title: "", weddingDate: "", region: "", guestCount: "" };

export default function HomePage() {
  const router = useRouter();

  const [projects, setProjects] = useState<readonly ProjectRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /** 비로그인(401)이면 /login으로 보낸다. 인증 게이트라 replace로 히스토리를 남기지 않는다. */
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

  // setState는 .then 콜백 안에서만 — react-hooks/set-state-in-effect 회피.
  const loadProjects = useCallback((): Promise<void> => {
    return api("/api/projects").then((result) => {
      if (result.ok) {
        const parsed = parseProjects(result.body);
        if (parsed === null) {
          setListError("프로젝트 목록 응답이 올바르지 않습니다.");
        } else {
          setProjects(parsed);
          setListError(null);
        }
      } else if (result.status !== 401) {
        setListError(apiError(result.body, "프로젝트 목록을 불러오지 못했습니다."));
      }
    });
  }, [api]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  /** title은 필수, 나머지는 빈 값이면 키를 빼지 않고 null/생략으로 보낸다(POST 검증기 규칙). */
  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const guestTrimmed = form.guestCount.trim();
    const guestNumber = guestTrimmed === "" ? null : Number(guestTrimmed);
    if (guestNumber !== null && Number.isNaN(guestNumber)) {
      setCreateError("하객 인원은 0 이상의 정수여야 합니다.");
      return;
    }
    const body: Record<string, string | number | null> = {
      title: form.title.trim(),
      weddingDate: form.weddingDate === "" ? null : form.weddingDate,
      region: form.region === "" ? null : form.region,
      guestCount: guestNumber,
    };
    setCreating(true);
    setCreateError(null);
    const result = await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setCreating(false);
    if (result.ok) {
      setForm(EMPTY_FORM);
      void loadProjects();
      return;
    }
    if (result.status !== 401) {
      setCreateError(apiError(result.body, "프로젝트 생성에 실패했습니다."));
    }
  }

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
        <PageHeader
          title="내 결혼준비 프로젝트"
          aside={<CardLink href="/wedding-halls">예식장 공개자료 조회</CardLink>}
        />

        {/* 프로젝트 행은 카드 모양이지만 바깥을 Card로 한 번 더 감싸지 않는다(카드 중첩 금지). */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">프로젝트 목록</h2>
          {projects === null && listError === null && <p className="text-sm text-ink-muted">불러오는 중...</p>}
          {listError !== null && (
            <p role="alert" className="text-sm text-negative">
              {listError}
            </p>
          )}
          {projects !== null && projects.length === 0 && listError === null && (
            <p className="text-sm text-ink-muted">아직 프로젝트가 없습니다. 아래에서 첫 프로젝트를 만들어 보세요.</p>
          )}
          <ul className="flex flex-col gap-3 sm:gap-4">
            {(projects ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  href={`/projects/${row.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(42_36_32/0.04)] transition-colors hover:border-line-strong"
                >
                  <span className="font-semibold">{row.title}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                    <ProjectRowMeta row={row} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Card title="새 프로젝트 만들기">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Field label="프로젝트 이름">
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
              <Field label="지역" hint="비우면 미지정">
                <select
                  className={inputClass}
                  value={form.region}
                  onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
                >
                  <option value="">미지정</option>
                  {REGION_OPTIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="하객 인원" hint="비우면 미정">
                <input
                  type="number"
                  className={inputClass}
                  value={form.guestCount}
                  onChange={(event) => setForm((prev) => ({ ...prev, guestCount: event.target.value }))}
                />
              </Field>
            </div>
            {createError !== null && (
              <p role="alert" className="text-sm text-negative">
                {createError}
              </p>
            )}
            <Button type="submit" disabled={creating} className="self-start">
              생성
            </Button>
          </form>
        </Card>
      </main>
    </AppShell>
  );
}
