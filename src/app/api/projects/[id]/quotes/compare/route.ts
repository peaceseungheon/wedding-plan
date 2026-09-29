import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { buildCompare } from "@/lib/domain/compare";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/projects/{id}/quotes/compare?ids=a,b[,c]
 *
 * ids는 쉼표 구분 문자열 하나로 받는다(반복 파라미터도 흡수한다). 중복 id는
 * 한 번만 셈한다(a,a → a) — 동일 견적 재지정을 오류로 승격시키지 않는다.
 * 비교는 2~5개만 허용하며, 0~1개·6개 이상은 400.
 */
const MIN_QUOTES = 2;
const MAX_QUOTES = 5;

function parseQuoteIds(url: URL): string[] {
  const raw = url.searchParams.getAll("ids").flatMap((value) => value.split(","));
  return [...new Set(raw.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/** 존재하지 않는 id와 남의 프로젝트 견적을 구분하지 않는다(존재 유출 방지). */
function quotesNotFound(): NextResponse {
  return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const project = await requireProjectOwner(projectId, user.value.id);
  if (!project.ok) return project.response;

  const ids = parseQuoteIds(new URL(req.url));
  if (ids.length < MIN_QUOTES || ids.length > MAX_QUOTES) {
    return NextResponse.json(
      { error: `비교할 견적은 ${MIN_QUOTES}개 이상 ${MAX_QUOTES}개 이하로 선택하세요.` },
      { status: 400 },
    );
  }

  // id 존재 여부와 프로젝트 소속을 한 쿼리에서 동시에 필터링한다.
  // 반환 개수가 요청 개수와 어긋나면 둘 중 무엇이 원인이든 똑같이 404다.
  const quotes = await prisma.quotes.findMany({
    where: { id: { in: ids }, projectVendor: { projectId } },
    include: {
      quoteItems: true,
      projectVendor: { include: { vendor: { select: { name: true } } } },
    },
  });
  if (quotes.length !== ids.length) return quotesNotFound();

  const byId = new Map(quotes.map((quote) => [quote.id, quote] as const));
  const ordered: (typeof quotes)[number][] = [];
  for (const id of ids) {
    const quote = byId.get(id);
    if (quote === undefined) return quotesNotFound();
    ordered.push(quote);
  }

  const result = buildCompare(
    ordered.map((quote) => ({
      quoteId: quote.id,
      vendorName: quote.projectVendor.vendor.name,
      quoteDate: quote.quoteDate,
      guestCount: quote.guestCount,
      items: quote.quoteItems.map((item) => ({
        itemCode: item.itemCode,
        rawName: item.rawName,
        amount: item.amount,
        required: item.required,
        selected: item.selected,
      })),
    })),
  );

  return NextResponse.json(result);
}
