"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 프로젝트 카드에 필요한 필드만. weddingDate는 ISO 문자열 또는 null. */
type ProjectRow = {
  readonly id: string;
  readonly title: string;
  readonly weddingDate: string | null;
  readonly region: string | null;
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
    return [
      {
        id,
        title,
        weddingDate: typeof weddingDate === "string" ? weddingDate : null,
        region: typeof region === "string" ? region : null,
      },
    ];
  });
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
      region: form.region.trim() === "" ? null : form.region.trim(),
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">내 결혼준비 프로젝트</h1>
        <Link href="/wedding-halls" className="text-sm text-zinc-600 underline-offset-4 hover:underline">
          예식장 공개자료 조회 →
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">새 프로젝트 만들기</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
          <label className="flex flex-col gap-1 text-sm">
            프로젝트 이름
            <input
              required
              className="rounded border border-zinc-300 px-3 py-2"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              예식일 (선택)
              <input
                type="date"
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.weddingDate}
                onChange={(event) => setForm((prev) => ({ ...prev, weddingDate: event.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              지역 (선택)
              <input
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              />
            </label>
            <label className="flex w-32 flex-col gap-1 text-sm">
              하객 인원 (선택)
              <input
                type="number"
                className="rounded border border-zinc-300 px-3 py-2"
                value={form.guestCount}
                onChange={(event) => setForm((prev) => ({ ...prev, guestCount: event.target.value }))}
              />
            </label>
          </div>
          {createError !== null && <p className="text-sm text-red-600">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            생성
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">프로젝트 목록</h2>
        {projects === null && listError === null && <p className="text-sm text-zinc-600">불러오는 중...</p>}
        {listError !== null && <p className="text-sm text-red-600">{listError}</p>}
        {projects !== null && projects.length === 0 && listError === null && (
          <p className="text-sm text-zinc-600">아직 프로젝트가 없습니다. 위에서 첫 프로젝트를 만들어 보세요.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(projects ?? []).map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${row.id}`}
                className="flex flex-col gap-1 rounded border border-zinc-200 p-3 hover:border-zinc-400"
              >
                <span className="font-medium">{row.title}</span>
                <span className="text-sm text-zinc-600">
                  {row.weddingDate !== null ? `예식일 ${row.weddingDate.slice(0, 10)}` : "예식일 미정"}
                  {row.region !== null ? ` · ${row.region}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
