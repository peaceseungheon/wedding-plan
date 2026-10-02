import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wedding-halls?region=
 *
 * 예식장 공개자료(wedding_hall_disclosures) 목록. region은 선택 필터다 —
 * 값이 비거나 없으면 전체 지역을 반환한다. 목록 카드에는 가격 항목 수만
 * 노출하고 항목 본문은 상세 API(/api/wedding-halls/[id])에서 내려준다.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const params = new URL(req.url).searchParams;
  const region = params.get("region")?.trim() ?? "";

  const rows = await prisma.wedding_hall_disclosures.findMany({
    where: {
      ...(region.length > 0 ? { region } : {}),
    },
    orderBy: [{ region: "asc" }, { venueName: "asc" }],
    include: { _count: { select: { priceItems: true } } },
  });

  return NextResponse.json({
    weddingHalls: rows.map((row) => ({
      id: row.id,
      boardSeq: row.boardSeq,
      region: row.region,
      venueName: row.venueName,
      address: row.address,
      phone: row.phone,
      disclosedAt: row.disclosedAt === null ? null : row.disclosedAt.toISOString(),
      priceItemCount: row._count.priceItems,
    })),
  });
}
