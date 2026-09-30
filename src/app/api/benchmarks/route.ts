import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/benchmarks?region=&category=
 *
 * 참가격 평균 행 목록. region·category는 모두 선택 필터다 — 값이 비거나
 * 없으면 그 조건은 적용하지 않는다. category는 벤치마크 행 자체의 분류
 * 문자열("웨딩홀"·"스드메")과 정확히 일치시켜 필터링한다.
 * sourcePeriod는 필터로 열지 않는다 — 화면은 전체를 받아 최신 기간을 골라 쓴다.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const params = new URL(req.url).searchParams;
  const region = params.get("region")?.trim() ?? "";
  const category = params.get("category")?.trim() ?? "";

  const rows = await prisma.price_benchmarks.findMany({
    where: {
      ...(region.length > 0 ? { region } : {}),
      ...(category.length > 0 ? { category } : {}),
    },
    orderBy: [
      { sourcePeriod: "desc" },
      { region: "asc" },
      { category: "asc" },
      { itemCode: "asc" },
    ],
  });

  // 내부 필드(id·sourceType·createdAt)는 계약에서 떼고 필요한 필드만 노출한다.
  return NextResponse.json({
    benchmarks: rows.map((row) => ({
      region: row.region,
      category: row.category,
      itemCode: row.itemCode,
      avgPrice: row.avgPrice,
      sampleSize: row.sampleSize,
      sourcePeriod: row.sourcePeriod,
    })),
  });
}
