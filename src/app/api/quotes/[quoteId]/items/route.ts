import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseQuoteItemCreate, normalizeQuoteItemAmount } from "@/lib/domain/quote-item";
import { prisma } from "@/lib/prisma";

/**
 * 소유 체인(quote → project_vendors → wedding_projects)을 한 쿼리로 푼다.
 * 항목 쓰기는 견적 상태에 따라 막히므로 status도 함께 실어 간다.
 */
async function loadQuote(quoteId: string) {
  return prisma.quotes.findUnique({
    where: { id: quoteId },
    select: { id: true, status: true, projectVendor: { select: { projectId: true } } },
  });
}

function quoteNotFound(): NextResponse {
  return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
}

/**
 * 견적 항목 수정은 확정 전까지만 허용한다(PRD 7장). CONFIRMED 견적의 항목
 * 추가는 409 — 항목이 바뀌면 확정 스냅샷 의미가 무너지기 때문이다.
 */
function quoteConfirmed(): NextResponse {
  return NextResponse.json({ error: "확정된 견적의 항목은 수정할 수 없습니다." }, { status: 409 });
}

/** 같은 견적 안에서 sortOrder 충돌을 피하기 위해 최댓값+1을 계산한다. */
async function nextSortOrder(quoteId: string): Promise<number> {
  const aggregate = await prisma.quote_items.aggregate({
    _max: { sortOrder: true },
    where: { quoteId },
  });
  return (aggregate._max.sortOrder ?? 0) + 1;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<NextResponse> {
  const { quoteId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const quote = await loadQuote(quoteId);
  if (quote === null) return quoteNotFound();

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  if (quote.status !== "DRAFT") return quoteConfirmed();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  const parsed = parseQuoteItemCreate(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const amount = normalizeQuoteItemAmount(parsed.value.qty, parsed.value.unitPrice, parsed.value.itemCode);
  const created = await prisma.quote_items.create({
    data: {
      quoteId,
      rawName: parsed.value.rawName,
      itemCode: parsed.value.itemCode,
      qty: parsed.value.qty,
      unitPrice: parsed.value.unitPrice,
      amount,
      required: parsed.value.required,
      selected: parsed.value.selected,
      sortOrder: parsed.value.sortOrder ?? (await nextSortOrder(quoteId)),
    },
  });
  return NextResponse.json(created, { status: 201 });
}
