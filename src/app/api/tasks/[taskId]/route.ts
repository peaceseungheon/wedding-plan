import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly taskId: string }> };

type ValidTaskUpdate = {
  readonly title?: string;
  readonly dueDate?: Date | null;
  readonly done?: boolean;
  readonly sortOrder?: number;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * 부분 수정 검증: 키가 없으면 그 필드는 건드리지 않는다. dueDate는 null로
 * 명시하면 삭제(마감일 제거). sortOrder는 재정렬 시 클라이언트가 계산해
 * 넘기는 값을 그대로 저장한다(중복 허용).
 */
function validateTaskUpdate(raw: unknown): ValidationResult<ValidTaskUpdate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }

  const value: {
    title?: string;
    dueDate?: Date | null;
    done?: boolean;
    sortOrder?: number;
  } = {};

  if ("title" in raw) {
    if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
      return { ok: false, error: "할 일 제목을 입력하세요." };
    }
    value.title = raw.title.trim();
  }

  if ("dueDate" in raw) {
    if (raw.dueDate === null) {
      value.dueDate = null;
    } else if (typeof raw.dueDate === "string") {
      const parsed = parseWeddingDate(raw.dueDate);
      if (parsed === null) {
        return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
      }
      value.dueDate = parsed;
    } else {
      return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
  }

  if ("done" in raw) {
    if (typeof raw.done !== "boolean") {
      return { ok: false, error: "done은 boolean이어야 합니다." };
    }
    value.done = raw.done;
  }

  if ("sortOrder" in raw) {
    if (typeof raw.sortOrder !== "number" || !Number.isInteger(raw.sortOrder)) {
      return { ok: false, error: "sortOrder는 정수여야 합니다." };
    }
    value.sortOrder = raw.sortOrder;
  }

  if (
    value.title === undefined &&
    value.dueDate === undefined &&
    value.done === undefined &&
    value.sortOrder === undefined
  ) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }
  return { ok: true, value };
}

/** 소유 프로젝트의 단일 할 일 부분 수정. 소유 체인은 task → project로 풀어
 * 남의 taskId도 404로 은닉한다. 삭제는 MVP 범위 밖이라 PUT만 제공한다. */
export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { taskId } = await ctx.params;

  const task = await prisma.tasks.findUnique({ where: { id: taskId } });
  if (task === null) {
    return NextResponse.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
  }
  const owned = await requireProjectOwner(task.projectId, user.value.id);
  if (!owned.ok) return owned.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validateTaskUpdate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const updated = await prisma.tasks.update({
    where: { id: task.id },
    data: {
      title: validated.value.title,
      dueDate: validated.value.dueDate,
      done: validated.value.done,
      sortOrder: validated.value.sortOrder,
    },
  });

  return NextResponse.json({
    task: {
      id: updated.id,
      title: updated.title,
      dueDate: updated.dueDate,
      done: updated.done,
      sortOrder: updated.sortOrder,
    },
  });
}
