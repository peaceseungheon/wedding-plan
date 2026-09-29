// 참가격 CSV 임포트 CLI — price_benchmarks 테이블 upsert.
// 사용: npx tsx scripts/import-benchmarks.ts <csvPath>
// 헤더가 틀리면 전체 중단, 데이터 행 오류는 행번호 경고 후 스킵(fail-soft).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

const EXPECTED_HEADER = [
  'region',
  'category',
  'itemCode',
  'avgPrice',
  'sampleSize',
  'sourcePeriod',
] as const;

const INT_PATTERN = /^[0-9]+$/;

interface BenchmarkRow {
  readonly region: string;
  readonly category: string;
  readonly itemCode: string | null;
  readonly avgPrice: number;
  readonly sampleSize: number;
  readonly sourcePeriod: string;
}

type RowParse =
  | { readonly ok: true; readonly row: BenchmarkRow }
  | { readonly ok: false; readonly reason: string };

// Prisma 7 driver adapter는 복합 유니크 where에 null을 거부하므로
// (itemCode: null → "Argument must not be null") find-then-create/update로 upsert를 구현한다.
async function upsertBenchmark(prisma: PrismaClient, row: BenchmarkRow): Promise<void> {
  const existing = await prisma.price_benchmarks.findFirst({
    where: {
      region: row.region,
      category: row.category,
      itemCode: row.itemCode,
      sourcePeriod: row.sourcePeriod,
    },
    select: { id: true },
  });
  if (existing === null) {
    await prisma.price_benchmarks.create({ data: row });
    return;
  }
  await prisma.price_benchmarks.update({
    where: { id: existing.id },
    data: { avgPrice: row.avgPrice, sampleSize: row.sampleSize },
  });
}

function cell(cells: readonly string[], index: number): string {
  return (cells[index] ?? '').trim();
}

function parseRow(cells: readonly string[]): RowParse {
  if (cells.length !== EXPECTED_HEADER.length) {
    return {
      ok: false,
      reason: `컬럼 수 ${cells.length}개, 기대 ${EXPECTED_HEADER.length}개`,
    };
  }
  const region = cell(cells, 0);
  const category = cell(cells, 1);
  const itemCode = cell(cells, 2);
  const avgPriceText = cell(cells, 3);
  const sampleSizeText = cell(cells, 4);
  const sourcePeriod = cell(cells, 5);

  if (region === '' || category === '' || sourcePeriod === '') {
    return { ok: false, reason: 'region/category/sourcePeriod는 필수' };
  }
  if (!INT_PATTERN.test(avgPriceText) || Number(avgPriceText) <= 0) {
    return { ok: false, reason: `avgPrice는 양의 정수 (입력값: ${avgPriceText})` };
  }
  if (!INT_PATTERN.test(sampleSizeText)) {
    return { ok: false, reason: `sampleSize는 0 이상 정수 (입력값: ${sampleSizeText})` };
  }
  return {
    ok: true,
    row: {
      region,
      category,
      itemCode: itemCode === '' ? null : itemCode,
      avgPrice: Number(avgPriceText),
      sampleSize: Number(sampleSizeText),
      sourcePeriod,
    },
  };
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (csvPath === undefined) {
    throw new Error('사용법: npx tsx scripts/import-benchmarks.ts <csvPath>');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL 환경변수가 없습니다 (.env 참조)');
  }

  const lines = readFileSync(csvPath, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  const header = (lines[0] ?? '').split(',').map((c) => c.trim());
  const headerMatches =
    header.length === EXPECTED_HEADER.length &&
    EXPECTED_HEADER.every((name, i) => header[i] === name);
  if (!headerMatches) {
    throw new Error(`CSV 헤더 불일치. 기대: ${EXPECTED_HEADER.join(',')}`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
  try {
    let imported = 0;
    let skipped = 0;
    for (const [offset, line] of lines.slice(1).entries()) {
      if (line.trim() === '') continue;
      const result = parseRow(line.split(','));
      if (!result.ok) {
        skipped += 1;
        console.error(`[경고] ${offset + 2}행 스킵: ${result.reason}`);
        continue;
      }
      const { row } = result;
      await upsertBenchmark(prisma, row);
      imported += 1;
    }
    console.log(`임포트 완료: 성공 ${imported}건, 스킵 ${skipped}건 (${csvPath})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`오류: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
