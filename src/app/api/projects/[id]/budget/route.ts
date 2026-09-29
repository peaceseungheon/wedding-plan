import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

type BudgetItemInput = {
  readonly id: string | null;
  readonly name: string;
  readonly plannedAmount: number;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * PUT 트랜잭션 안에서 검증 실패를 던져 갱신 전체를 롤백시키기 위한 에러.
 * status를 함께 들고 있어 catch 지점에서 그대로 응답으로 변환한다.
 */
class BudgetRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 본문 전체 검증. id 없는 항목은 신규 생성, id 있는 항목은 해당 프로젝트
 * 카테고리의 수정 대상이 된다. 배열이 아니거나 비어 있으면 400 — 최소 1개 유지.
 */
function validateBudgetItems(raw: unknown): ValidationResult<readonly BudgetItemInput[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "예산 항목은 배열이어야 합니다." };
  }
  const entries: readonly unknown[] = raw;
  if (entries.length === 0) {
    return { ok: false, error: "예산 카테고리는 최소 1개 이상이어야 합니다." };
  }

  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const items: BudgetItemInput[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "예산 항목은 객체여야 합니다." };
    }
    if (!("name" in entry) || typeof entry.name !== "string" || entry.name.trim().length === 0) {
      return { ok: false, error: "카테고리 이름은 1자 이상 문자열이어야 합니다." };
    }
    if (
      !("plannedAmount" in entry) ||
      typeof entry.plannedAmount !== "number" ||
      !Number.isInteger(entry.plannedAmount) ||
      entry.plannedAmount < 0
    ) {
      return { ok: false, error: "plannedAmount는 0 이상의 정수여야 합니다." };
    }

    let id: string | null = null;
    if ("id" in entry && entry.id !== undefined && entry.id !== null) {
      if (typeof entry.id !== "string" || entry.id.length === 0) {
        return { ok: false, error: "id는 문자열이어야 합니다." };
      }
      if (seenIds.has(entry.id)) {
        return { ok: false, error: "id가 중복됩니다." };
      }
      seenIds.add(entry.id);
      id = entry.id;
    }

    const name = entry.name.trim();
    if (seenNames.has(name)) {
      return { ok: false, error: "카테고리 이름이 중복됩니다." };
    }
    seenNames.add(name);

    items.push({ id, name, plannedAmount: entry.plannedAmount });
  }
  return { ok: true, value: items };
}

/** 본인 프로젝트의 예산 카테고리 목록. sortOrder 오름차순. */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  const categories = await prisma.budget_categories.findMany({
    where: { projectId: owned.value.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, plannedAmount: true, sortOrder: true },
  });
  return NextResponse.json({ categories });
}

/**
 * 전체 교체 원자 갱신. id 있으면 수정(타 프로젝트 소속이면 400), 없으면 생성,
 * 본문에 없던 기존 행은 삭제 — 하나의 $transaction이라 부분 실패가 없다.
 *
 * @@unique([projectId, name]) 때문에 생존 행끼리 이름을 맞바꾸는 수정(A→B, B→A)은
 * 순차 update로는 중간 상태에서 제약 위반이 난다. 그래서 최종 이름을 쓰기 전에
 * 임시 이름(행 cuid 포함, 배치 안에서 유일)으로 한 번 돌린 뒤 최종 값을 적는다.
 * sortOrder는 본문 배열 순서대로 1..N을 다시 부여해 연속성을 보존한다.
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

  const validated = validateBudgetItems(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const items = validated.value;

  try {
    const categories = await prisma.$transaction(async (tx) => {
      const existing = await tx.budget_categories.findMany({
        where: { projectId: owned.value.id },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((row) => row.id));

      for (const item of items) {
        if (item.id !== null && !existingIds.has(item.id)) {
          throw new BudgetRequestError(
            "프로젝트에 존재하지 않는 카테고리가 포함되어 있습니다.",
            400,
          );
        }
      }

      const keptIds: string[] = [];
      for (const item of items) {
        if (item.id !== null) keptIds.push(item.id);
      }
      await tx.budget_categories.deleteMany({
        where: { projectId: owned.value.id, id: { notIn: keptIds } },
      });

      for (const item of items) {
        if (item.id !== null) {
          await tx.budget_categories.update({
            where: { id: item.id },
            data: { name: `__budget_tmp_${item.id}` },
          });
        }
      }
      for (const [index, item] of items.entries()) {
        if (item.id !== null) {
          await tx.budget_categories.update({
            where: { id: item.id },
            data: {
              name: item.name,
              plannedAmount: item.plannedAmount,
              sortOrder: index + 1,
            },
          });
        }
      }

      const createData: {
        projectId: string;
        name: string;
        plannedAmount: number;
        sortOrder: number;
      }[] = [];
      for (const [index, item] of items.entries()) {
        if (item.id === null) {
          createData.push({
            projectId: owned.value.id,
            name: item.name,
            plannedAmount: item.plannedAmount,
            sortOrder: index + 1,
          });
        }
      }
      await tx.budget_categories.createMany({ data: createData });

      return tx.budget_categories.findMany({
        where: { projectId: owned.value.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, plannedAmount: true, sortOrder: true },
      });
    });

    return NextResponse.json({ categories });
  } catch (error) {
    if (error instanceof BudgetRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
