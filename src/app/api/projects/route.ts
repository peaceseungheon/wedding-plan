import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { BUDGET_CATEGORY_LEAVES, CHECKLIST_TEMPLATE } from "@/lib/constants/templates";
import { parseWeddingDate, taskDueDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type ValidProjectCreate = {
  readonly title: string;
  readonly weddingDate: Date | null;
  readonly region: string | null;
  readonly guestCount: number | null;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function validateProjectCreate(raw: unknown): ValidationResult<ValidProjectCreate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "프로젝트 이름을 입력하세요." };
  }
  if (!("title" in raw) || typeof raw.title !== "string" || raw.title.trim().length === 0) {
    return { ok: false, error: "프로젝트 이름을 입력하세요." };
  }

  let weddingDate: Date | null = null;
  if ("weddingDate" in raw && raw.weddingDate !== null) {
    if (typeof raw.weddingDate !== "string") {
      return { ok: false, error: "weddingDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    weddingDate = parseWeddingDate(raw.weddingDate);
    if (weddingDate === null) {
      return { ok: false, error: "weddingDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
  }

  let region: string | null = null;
  if ("region" in raw && raw.region !== null) {
    if (typeof raw.region !== "string" || raw.region.trim().length === 0) {
      return { ok: false, error: "region은 문자열이어야 합니다." };
    }
    region = raw.region.trim();
  }

  let guestCount: number | null = null;
  if ("guestCount" in raw && raw.guestCount !== null) {
    if (typeof raw.guestCount !== "number" || !Number.isInteger(raw.guestCount) || raw.guestCount < 0) {
      return { ok: false, error: "guestCount는 0 이상의 정수여야 합니다." };
    }
    guestCount = raw.guestCount;
  }

  return {
    ok: true,
    value: { title: raw.title.trim(), weddingDate, region, guestCount },
  };
}

/** 본인 프로젝트만, 최신순. */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const projects = await prisma.wedding_projects.findMany({
    where: { userId: auth.value.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects });
}

/**
 * 프로젝트 생성. 예산 카테고리 템플릿 8행과 기본 체크리스트 12행 복제까지
 * 하나의 $transaction으로 — 하위 행이 반만 생긴 프로젝트는 존재하지 않는다.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validateProjectCreate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { title, weddingDate, region, guestCount } = validated.value;

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.wedding_projects.create({
      data: { userId: auth.value.id, title, weddingDate, region, guestCount },
    });
    await tx.budget_categories.createMany({
      data: BUDGET_CATEGORY_LEAVES.map((leaf) => ({
        projectId: created.id,
        name: leaf.name,
        sortOrder: leaf.sortOrder,
      })),
    });
    await tx.tasks.createMany({
      data: CHECKLIST_TEMPLATE.map((item) => ({
        projectId: created.id,
        title: item.title,
        sortOrder: item.sortOrder,
        dueDate:
          weddingDate === null ? null : taskDueDate(weddingDate, item.dueOffsetMonths),
      })),
    });
    return created;
  });

  return NextResponse.json({ project }, { status: 201 });
}
