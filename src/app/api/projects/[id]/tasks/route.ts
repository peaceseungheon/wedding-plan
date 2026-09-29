import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type ValidTaskCreate = {
  readonly title: string;
  readonly dueDate: Date | null;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function validateTaskCreate(raw: unknown): ValidationResult<ValidTaskCreate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "할 일 제목을 입력하세요." };
  }
  if (!("title" in raw) || typeof raw.title !== "string" || raw.title.trim().length === 0) {
    return { ok: false, error: "할 일 제목을 입력하세요." };
  }

  let dueDate: Date | null = null;
  if ("dueDate" in raw && raw.dueDate !== null) {
    if (typeof raw.dueDate !== "string") {
      return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    dueDate = parseWeddingDate(raw.dueDate);
    if (dueDate === null) {
      return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
  }

  return { ok: true, value: { title: raw.title.trim(), dueDate } };
}

/** 템플릿 12행과 사용자 추가 행을 동일하게 취급하는 체크리스트 응답 형태. */
function toTaskPayload(task: {
  readonly id: string;
  readonly title: string;
  readonly dueDate: Date | null;
  readonly done: boolean;
  readonly sortOrder: number;
}) {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    done: task.done,
    sortOrder: task.sortOrder,
  };
}

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

/** 소유 프로젝트의 모든 할 일. 템플릿·사용자 행 구분 없이 sortOrder 오름차순. */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, user.value.id);
  if (!owned.ok) return owned.response;

  const tasks = await prisma.tasks.findMany({
    where: { projectId: owned.value.id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ tasks: tasks.map(toTaskPayload) });
}

/**
 * 사용자 할 일 추가. sortOrder는 기존 최댓값 + 1(템플릿 행이 1..12이므로
 * 첫 사용자 행은 13). tasks에 유니크 제약이 없어 동시성 하 중복은 허용한다.
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, user.value.id);
  if (!owned.ok) return owned.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validateTaskCreate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const max = await prisma.tasks.aggregate({
    where: { projectId: owned.value.id },
    _max: { sortOrder: true },
  });

  const task = await prisma.tasks.create({
    data: {
      projectId: owned.value.id,
      title: validated.value.title,
      dueDate: validated.value.dueDate,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json({ task: toTaskPayload(task) }, { status: 201 });
}
