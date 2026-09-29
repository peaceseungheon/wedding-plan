import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { CHECKLIST_TEMPLATE } from "@/lib/constants/templates";
import { parseWeddingDate, taskDueDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

type ValidProjectUpdate = {
  readonly title?: string;
  readonly weddingDate?: Date | null;
  readonly region?: string | null;
  readonly guestCount?: number | null;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * 부분 수정 검증: 키가 없으면 그 필드는 건드리지 않는다(다른 필드와 구분).
 * 키가 아예 없으면 수정할 것이 없으므로 400.
 */
function validateProjectUpdate(raw: unknown): ValidationResult<ValidProjectUpdate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }

  const value: {
    title?: string;
    weddingDate?: Date | null;
    region?: string | null;
    guestCount?: number | null;
  } = {};

  if ("title" in raw) {
    if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
      return { ok: false, error: "프로젝트 이름을 입력하세요." };
    }
    value.title = raw.title.trim();
  }

  if ("weddingDate" in raw) {
    if (raw.weddingDate === null) {
      value.weddingDate = null;
    } else if (typeof raw.weddingDate === "string") {
      const parsed = parseWeddingDate(raw.weddingDate);
      if (parsed === null) {
        return { ok: false, error: "weddingDate는 YYYY-MM-DD 형식이어야 합니다." };
      }
      value.weddingDate = parsed;
    } else {
      return { ok: false, error: "weddingDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
  }

  if ("region" in raw) {
    if (raw.region === null) {
      value.region = null;
    } else if (typeof raw.region === "string" && raw.region.trim().length > 0) {
      value.region = raw.region.trim();
    } else {
      return { ok: false, error: "region은 문자열이어야 합니다." };
    }
  }

  if ("guestCount" in raw) {
    if (raw.guestCount === null) {
      value.guestCount = null;
    } else if (
      typeof raw.guestCount === "number" &&
      Number.isInteger(raw.guestCount) &&
      raw.guestCount >= 0
    ) {
      value.guestCount = raw.guestCount;
    } else {
      return { ok: false, error: "guestCount는 0 이상의 정수여야 합니다." };
    }
  }

  if (value.title === undefined && value.weddingDate === undefined && value.region === undefined && value.guestCount === undefined) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }
  return { ok: true, value };
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  return NextResponse.json({ project: owned.value });
}

/**
 * 부분 수정. weddingDate가 바뀌면 템플릿 12항목의 마감일도 예식일 기준으로
 * 재계산한다. tasks에 유니크 제약이 없어 템플릿 행은 (projectId, sortOrder)로
 * 매칭한다(learnings.md) — 프로젝트 생성 시 sortOrder가 템플릿과 1:1이다.
 */
export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validateProjectUpdate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.wedding_projects.update({
      where: { id: owned.value.id },
      data: {
        title: validated.value.title,
        weddingDate: validated.value.weddingDate,
        region: validated.value.region,
        guestCount: validated.value.guestCount,
      },
    });
    if (validated.value.weddingDate !== undefined) {
      const weddingDate = updated.weddingDate;
      for (const item of CHECKLIST_TEMPLATE) {
        await tx.tasks.updateMany({
          where: { projectId: owned.value.id, sortOrder: item.sortOrder },
          data: {
            dueDate:
              weddingDate === null ? null : taskDueDate(weddingDate, item.dueOffsetMonths),
          },
        });
      }
    }
    return updated;
  });

  return NextResponse.json({ project });
}
