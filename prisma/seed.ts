import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const SOURCE_PERIOD = "2026-H1";

// 참가격 평균가 샘플(서울/경기 × 웨딩홀/스드메). 금액 단위는 원(KRW, Int).
// itemCode를 null로 두면 MySQL 유니크 제약이 NULL을 서로 다른 행으로 쳐서
// 멱등 upsert가 깨지므로 6행 모두 실코드를 쓴다.
const BENCHMARK_ROWS = [
  { region: "서울", category: "웨딩홀", itemCode: "HALL_RENTAL", avgPrice: 20_000_000, sampleSize: 120 },
  { region: "서울", category: "웨딩홀", itemCode: "MEAL", avgPrice: 15_000_000, sampleSize: 120 },
  { region: "서울", category: "스드메", itemCode: "STUDIO_BASE", avgPrice: 1_500_000, sampleSize: 90 },
  { region: "경기", category: "웨딩홀", itemCode: "HALL_RENTAL", avgPrice: 15_000_000, sampleSize: 100 },
  { region: "경기", category: "웨딩홀", itemCode: "MEAL", avgPrice: 12_500_000, sampleSize: 100 },
  { region: "경기", category: "스드메", itemCode: "STUDIO_BASE", avgPrice: 1_200_000, sampleSize: 80 },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  // 예산 카테고리/체크리스트 템플릿은 projectId가 필요한 프로젝트 행이라 여기서 시드하지
  // 않는다. src/lib/constants/templates.ts 상수를 프로젝트 생성 API(task 9)가 복제한다.
  for (const row of BENCHMARK_ROWS) {
    await prisma.price_benchmarks.upsert({
      where: {
        region_category_itemCode_sourcePeriod: {
          region: row.region,
          category: row.category,
          itemCode: row.itemCode,
          sourcePeriod: SOURCE_PERIOD,
        },
      },
      create: { ...row, sourcePeriod: SOURCE_PERIOD },
      update: { avgPrice: row.avgPrice, sampleSize: row.sampleSize },
    });
  }

  const count = await prisma.price_benchmarks.count();
  console.log(`seeded price_benchmarks: ${count} rows (upsert on region+category+itemCode+sourcePeriod)`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
