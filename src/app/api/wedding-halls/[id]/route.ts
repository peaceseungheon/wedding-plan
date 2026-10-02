import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

/**
 * GET /api/wedding-halls/[id]
 *
 * 예식장 공개자료 1건 상세 — 가격 항목·환급 정책을 sortOrder 순으로 함께
 * 내려준다. id가 없으면 404.
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const { id } = await ctx.params;
  const row = await prisma.wedding_hall_disclosures.findUnique({
    where: { id },
    include: {
      priceItems: { orderBy: [{ sortOrder: "asc" }] },
      refundPolicies: { orderBy: [{ sortOrder: "asc" }] },
    },
  });
  if (row === null) {
    return NextResponse.json({ error: "예식장 공개자료를 찾을 수 없습니다." }, { status: 404 });
  }

  // 내부 필드(scrapedAt·fileRgtnSeq)는 계약에서 떼고 화면에 필요한 필드만 노출한다.
  return NextResponse.json({
    weddingHall: {
      id: row.id,
      boardSeq: row.boardSeq,
      region: row.region,
      venueName: row.venueName,
      address: row.address,
      phone: row.phone,
      fileName: row.fileName,
      disclosedAt: row.disclosedAt === null ? null : row.disclosedAt.toISOString(),
      priceItems: row.priceItems.map((item) => ({
        hallName: item.hallName,
        itemGroup: item.itemGroup,
        itemName: item.itemName,
        rawValue: item.rawValue,
        priceMin: item.priceMin,
        priceMax: item.priceMax,
        sortOrder: item.sortOrder,
      })),
      refundPolicies: row.refundPolicies.map((policy) => ({
        periodText: policy.periodText,
        ruleText: policy.ruleText,
        sortOrder: policy.sortOrder,
      })),
    },
  });
}
