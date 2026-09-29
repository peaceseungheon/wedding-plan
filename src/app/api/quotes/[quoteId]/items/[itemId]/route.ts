import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { normalizeQuoteItemAmount, parseQuoteItemUpdate } from "@/lib/domain/quote-item";
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

function itemNotFound(): NextResponse {
  return NextResponse.json({ error: "견적 항목을 찾을 수 없습니다." }, { status: 404 });
}

/**
 * 견적 항목 수정은 확정 전까지만 허용한다(PRD 7장). CONFIRMED 견적의 항목
 * 수정·삭제는 409 — 항목이 바뀌면 확정 스냅샷 의미가 무너지기 때문이다.
 */
function quoteConfirmed(): NextResponse {
  return NextResponse.json({ error: "확정된 견적의 항목은 수정할 수 없습니다." }, { status: 409 });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ quoteId: string; itemId: string }> },
): Promise<NextResponse> {
  const { quoteId, itemId } = await params;

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
  const parsed = parseQuoteItemUpdate(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // itemId가 다른 견적에 속하면 소유 은닉과 동일하게 404로 보인다.
  const item = await prisma.quote_items.findFirst({ where: { id: itemId, quoteId } });
  if (item === null) return itemNotFound();

  // qty·unitPrice·itemCode 중 무엇이 바뀌든 저장 불변식(amount = 부호 규칙이
  // 적용된 qty × unitPrice)을 지키기 위해 병합 값으로 재계산한다.
  // undefined=키 없음(변경 없음), null=미분류 초기화 — 3상태를 그대로 병합한다.
  const qty = parsed.value.qty ?? item.qty;
  const unitPrice = parsed.value.unitPrice ?? item.unitPrice;
  const itemCode = parsed.value.itemCode !== undefined ? parsed.value.itemCode : item.itemCode;
  const amount = normalizeQuoteItemAmount(qty, unitPrice, itemCode);

  const updated = await prisma.quote_items.update({
    where: { id: itemId },
    data: { ...parsed.value, amount },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ quoteId: string; itemId: string }> },
): Promise<NextResponse> {
  const { quoteId, itemId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const quote = await loadQuote(quoteId);
  if (quote === null) return quoteNotFound();

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  if (quote.status !== "DRAFT") return quoteConfirmed();

  // quoteId를 조건에 넣어 타 견적의 항목 삭제를 시도하면 0행 → 404로 은닉한다.
  const deleted = await prisma.quote_items.deleteMany({ where: { id: itemId, quoteId } });
  if (deleted.count === 0) return itemNotFound();

  return new NextResponse(null, { status: 204 });
}
