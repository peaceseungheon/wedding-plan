"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

/** GET /api/projects/{id}/tasks 응답 행. 서버는 sortOrder 오름차순으로 준다. */
type TaskRow = {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  sortOrder: number;
};

/** unknown JSON을 캐스트 없이 TaskRow로 좁힌다(라우트 검증기와 같은 in-narrowing 관습). */
function parseTasks(raw: unknown): TaskRow[] {
  if (typeof raw !== "object" || raw === null || !("tasks" in raw) || !Array.isArray(raw.tasks)) {
    return [];
  }
  const rows: TaskRow[] = [];
  for (const item of raw.tasks) {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string" &&
      "title" in item &&
      typeof item.title === "string" &&
      "dueDate" in item &&
      (item.dueDate === null || typeof item.dueDate === "string") &&
      "done" in item &&
      typeof item.done === "boolean" &&
      "sortOrder" in item &&
      typeof item.sortOrder === "number"
    ) {
      rows.push({
        id: item.id,
        title: item.title,
        dueDate: item.dueDate,
        done: item.done,
        sortOrder: item.sortOrder,
      });
    }
  }
  return rows;
}

/** 오류 응답 본문의 error 메시지를 그대로 쓰고, 없으면 폴백 문구를 쓴다. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const raw: unknown = await res.json();
    if (typeof raw === "object" && raw !== null && "error" in raw && typeof raw.error === "string") {
      return raw.error;
    }
  } catch {
    // 본문이 JSON이 아니면 폴백 문구로 충분하다.
  }
  return fallback;
}

export default function TasksPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // setState를 .then 콜백 안에 두는 형태여야 set-state-in-effect 린트를 통과한다.
  const load = useCallback((): void => {
    fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" })
      .then(
        (res): Promise<TaskRow[] | "auth" | "fail"> =>
          res.status === 401
            ? Promise.resolve("auth")
            : res.ok
              ? res.json().then((raw: unknown) => parseTasks(raw))
              : Promise.resolve("fail"),
      )
      .then((result) => {
        if (result === "auth") {
          router.replace("/login");
          return;
        }
        if (result === "fail") {
          setError("할 일 목록을 불러오지 못했습니다.");
          return;
        }
        setTasks(result);
        setError(null);
      })
      .catch(() => {
        setError("할 일 목록을 불러오지 못했습니다.");
      });
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 마감일 있는 그룹은 임박순, 없는 그룹은 템플릿 순서(sortOrder)를 유지한다. */
  const groups = useMemo(() => {
    if (tasks === null) return null;
    const dated = tasks
      .filter((task) => task.dueDate !== null)
      .sort((a, b) => {
        const byDate = a.dueDate === b.dueDate ? 0 : (a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : 1;
        return byDate !== 0 ? byDate : a.sortOrder - b.sortOrder;
      });
    const undated = tasks
      .filter((task) => task.dueDate === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { dated, undated };
  }, [tasks]);

  async function toggleDone(task: TaskRow): Promise<void> {
    setTogglingId(task.id);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ done: !task.done }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "완료 처리에 실패했습니다."));
        return;
      }
      await load();
    } catch {
      setError("완료 처리에 실패했습니다.");
    } finally {
      setTogglingId(null);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (title.trim().length === 0) {
      setError("할 일 제목을 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(dueDate === "" ? { title } : { title, dueDate }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "할 일 추가에 실패했습니다."));
        return;
      }
      setTitle("");
      setDueDate("");
      await load();
    } catch {
      setError("할 일 추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderRow(task: TaskRow): ReactNode {
    return (
      <li key={task.id} className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-zinc-900"
          checked={task.done}
          disabled={togglingId === task.id}
          onChange={() => void toggleDone(task)}
          aria-label={`${task.title} 완료`}
        />
        <span
          className={
            task.done ? "flex-1 text-sm text-zinc-400 line-through" : "flex-1 text-sm text-zinc-900"
          }
        >
          {task.title}
        </span>
        {task.dueDate !== null && (
          <span className="text-sm text-zinc-500">{task.dueDate.slice(0, 10)}</span>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">할 일</h1>

      <form
        onSubmit={(event) => void addTask(event)}
        className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="할 일 제목"
          className="min-w-40 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="마감일"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          추가
        </button>
      </form>
      {error !== null && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {groups === null ? (
        <p className="mt-8 text-sm text-zinc-500">불러오는 중...</p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-500">마감일 있음 · 임박순</h2>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
              {groups.dated.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-400">마감일이 있는 할 일이 없습니다.</li>
              ) : (
                groups.dated.map(renderRow)
              )}
            </ul>
          </section>
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-500">마감일 없음</h2>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
              {groups.undated.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-400">할 일이 없습니다.</li>
              ) : (
                groups.undated.map(renderRow)
              )}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
