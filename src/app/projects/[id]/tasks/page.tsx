"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

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
      <li key={task.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-ink"
          checked={task.done}
          disabled={togglingId === task.id}
          onChange={() => void toggleDone(task)}
          aria-label={`${task.title} 완료`}
        />
        <span className={task.done ? "min-w-0 flex-1 text-ink-subtle line-through" : "min-w-0 flex-1"}>
          {task.title}
        </span>
        {task.done && <Badge tone="positive">✓ 완료</Badge>}
        {task.dueDate !== null && (
          <span className="shrink-0 tabular-nums text-ink-subtle">{task.dueDate.slice(0, 10)}</span>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader
        title="할 일"
        meta={
          tasks === null ? undefined : (
            <span className="tabular-nums">
              {tasks.filter((task) => task.done).length}/{tasks.length} 완료
            </span>
          )
        }
      />

      {error !== null && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {groups === null ? (
        <p className="text-sm text-ink-muted">불러오는 중...</p>
      ) : (
        <>
          <Card title="마감일 있음 · 임박순">
            {groups.dated.length === 0 ? (
              <p className="text-sm text-ink-muted">마감일이 있는 할 일이 없습니다.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">{groups.dated.map(renderRow)}</ul>
            )}
          </Card>
          <Card title="마감일 없음">
            {groups.undated.length === 0 ? (
              <p className="text-sm text-ink-muted">할 일이 없습니다.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">{groups.undated.map(renderRow)}</ul>
            )}
          </Card>
        </>
      )}

      <Card title="할 일 추가">
        <form onSubmit={(event) => void addTask(event)} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="제목">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="할 일 제목"
                className={inputClass}
              />
            </Field>
            <Field label="마감일">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Button type="submit" disabled={submitting} className="self-start">
            추가
          </Button>
        </form>
      </Card>
    </main>
  );
}
